// C:\Farmacia2026\Farmacia-2.0\src\app\Paginas\servicios\api-producto.service.ts

import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, tap, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

import { Carrito } from '../modelos/carrito';
import { Producto, ProductoId, ProductoParcial } from '../modelos/productos';

export type CategoriaUI = { id?: number; slug: string; label: string };

@Injectable({
  providedIn: 'root',
})
export class ApiProductoService {
  private readonly API = environment.apiUrl;

  // Rutas base
  private readonly url_producto = `${this.API}/producto`;
  public readonly url_carrito = `${this.API}/carrito`;

  // ✅ Categorías
  private readonly url_categorias = `${this.API}/categorias`;

  private comListaProd = new BehaviorSubject<Array<ProductoId>>([]);
  public listaProducto$ = this.comListaProd.asObservable();

  // ✅ paginación (si tu backend soporta _page)
  public paginaActualProducto = 1;

  private cartItemCount = new BehaviorSubject(0);

  // ✅ EVENTO PARA ACTUALIZAR STOCK SIN F5
  private stockChangedSubject = new Subject<void>();
  public stockChanged$ = this.stockChangedSubject.asObservable();

  // ✅ cache local del detalle del carrito (para pantallas como MedioPago)
  private carritoDetalleSubject = new BehaviorSubject<any[]>([]);
  public carritoDetalle$ = this.carritoDetalleSubject.asObservable();

  // =========================================================
  // ✅ CATEGORÍAS "VIVAS" PARA TODA LA APP (segment + modal)
  // =========================================================
  // ✅ CANÓNICO: medicamento (SINGULAR)
  private readonly baseCats: CategoriaUI[] = [
    { slug: 'medicamento', label: 'Medicamentos' },
    { slug: 'cremas', label: 'Cremas' },
    { slug: 'perfumes', label: 'Perfumes' },
  ];

  private categoriasSubject = new BehaviorSubject<CategoriaUI[]>([...this.baseCats]);
  public categorias$ = this.categoriasSubject.asObservable();

  constructor(private http: HttpClient) {}

  // ---------------------------
  // Helpers
  // ---------------------------
  private jsonHeaders() {
    return new HttpHeaders({ 'Content-Type': 'application/json;charset=utf-8' });
  }

  /** slug seguro */
  private slugify(input: string): string {
    return (input ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** ✅ Canon categoría: TODO se vuelve singular */
  private canonCat(raw: any): string {
    const s = this.slugify(String(raw ?? ''));
    if (!s) return '';
    if (s === 'medicamentos') return 'medicamento';
    if (s === 'medicamento') return 'medicamento';
    return s;
  }

  /** ✅ label bonito */
  private labelCat(slug: string): string {
    const s = this.canonCat(slug);
    if (s === 'medicamento') return 'Medicamentos';
    if (s === 'cremas') return 'Cremas';
    if (s === 'perfumes') return 'Perfumes';
    return s;
  }

  /** mezcla y deduplica por slug (CANÓNICO) */
  private mergeCats(base: CategoriaUI[], extra: CategoriaUI[]): CategoriaUI[] {
    const mapCats = new Map<string, CategoriaUI>();

    const push = (c: any) => {
      const slug = this.canonCat(c?.slug);
      if (!slug) return;

      const label =
        (c?.label ?? c?.nombre ?? c?.slug ?? this.labelCat(slug) ?? 'Categoría')
          .toString()
          .trim();

      if (!mapCats.has(slug)) {
        mapCats.set(slug, { id: c?.id, slug, label: label || this.labelCat(slug) });
      } else {
        const prev = mapCats.get(slug)!;
        mapCats.set(slug, {
          ...prev,
          id: prev.id ?? c?.id,
          label: label && label.length > 1 ? label : prev.label,
        });
      }
    };

    (Array.isArray(base) ? base : []).forEach(push);
    (Array.isArray(extra) ? extra : []).forEach(push);

    // sort bonito por label
    return Array.from(mapCats.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /** publica categorías (siempre con defaults) */
  private publishCategorias(list: CategoriaUI[]) {
    const safe = Array.isArray(list) && list.length ? list : [...this.baseCats];
    const merged = this.mergeCats([...this.baseCats], safe);
    this.categoriasSubject.next(merged.length ? merged : [...this.baseCats]);
  }

  /** ✅ dedupe blindaje por id (evita duplicados en UI aunque el backend repita) */
  private dedupeById<T extends any>(items: T[]): T[] {
    const mapId = new Map<number, T>();
    for (const it of (items ?? [])) {
      const id = Number((it as any)?.id);
      if (!Number.isFinite(id)) continue;
      mapId.set(id, it);
    }
    return Array.from(mapId.values());
  }

  /**
   * ✅ Normaliza producto para que tu UI sea consistente
   */
  private normalizarProducto(p: any) {
    const precioNormal = Number(p?.precioNormal ?? p?.precio ?? 0);
    const promoActiva = !!(p?.promoActiva ?? p?.promo_activa ?? false);
    const precioPromo = Number(p?.precioPromo ?? p?.precio_promo ?? 0);

    const imagen =
      p?.imagen ??
      p?.imagen_url ??
      p?.imagenUrl ??
      p?.imagenBase64 ??
      p?.imagen_base64 ??
      null;

    // ✅ categoría canónica SIEMPRE
    const categoriaCanon = this.canonCat(p?.categoria ?? p?.categoria_slug ?? '');

    return {
      ...p,
      categoria: categoriaCanon,

      // compat UI antigua
      precio: Number.isFinite(precioNormal) ? precioNormal : 0,
      imagen: imagen,

      // compat UI nueva
      precioNormal: Number.isFinite(precioNormal) ? precioNormal : 0,
      promoActiva: promoActiva,
      precioPromo: Number.isFinite(precioPromo) ? precioPromo : 0,
    };
  }

  // =========================================================
  // ✅ ADMIN QF (Crear/Editar/Borrar + Categorías)
  // =========================================================

  /**
   * ✅ Obtiene categorías del backend (si existe)
   * y actualiza categorias$ mezclando con defaults.
   */
  public getCategorias(): Observable<any[]> {
    return this.http.get<any[]>(this.url_categorias).pipe(
      map((cats) => (Array.isArray(cats) ? cats : [])),
      tap((cats) => {
        const normalized: CategoriaUI[] = (Array.isArray(cats) ? cats : [])
          .map((c: any) => {
            const raw = (c?.slug ?? c?.nombre ?? c?.categoria ?? '').toString();
            const slug = this.canonCat(raw);
            const label =
              (c?.nombre ?? c?.label ?? c?.slug ?? this.labelCat(slug) ?? 'Categoría').toString();
            return { id: c?.id, slug, label };
          })
          .filter((c) => !!c.slug);

        this.publishCategorias(normalized);
      }),
      catchError((err) => {
        console.error('[ApiProductoService] getCategorias ERROR', err);
        this.publishCategorias([...this.baseCats]);
        return of([]);
      })
    );
  }

  /**
   * ✅ agrega categoría local
   */
  public addCategoriaLocal(nombre: string) {
    const label = (nombre ?? '').toString().trim();
    const slug = this.canonCat(label);
    if (!slug || label.length < 2) return;

    const current = this.categoriasSubject.value ?? [...this.baseCats];
    const merged = this.mergeCats(current, [{ slug, label: this.labelCat(slug) || label }]);
    this.publishCategorias(merged);
  }

  /**
   * ✅ crea categoría en backend + actualiza categorias$ al tiro
   */
  public createCategoria(payload: { nombre: string }): Observable<any> {
    return this.http.post<any>(this.url_categorias, payload, { headers: this.jsonHeaders() }).pipe(
      tap((cat) => {
        const nombre = (cat?.nombre ?? payload?.nombre ?? '').toString().trim();
        if (!nombre) return;

        const slug = this.canonCat(cat?.slug ?? nombre);
        const label = this.labelCat(slug) || nombre;

        const current = this.categoriasSubject.value ?? [...this.baseCats];
        const merged = this.mergeCats(current, [{ id: cat?.id, slug, label }]);
        this.publishCategorias(merged);
      }),
      catchError((err) => {
        console.error('[ApiProductoService] createCategoria ERROR', err);
        throw err;
      })
    );
  }

  /** POST /producto */
  public createProducto(payload: any): Observable<any> {
    const p: any = { ...(payload ?? {}) };

    if (p?.categoria) p.categoria = this.canonCat(p.categoria);

    // ✅ stock SIEMPRE
    if (p.stock === undefined || p.stock === null || p.stock === '') p.stock = 0;
    p.stock = Number(p.stock);

    // ✅ compat backend viejo
    if (p.precioNormal !== undefined && p.precio === undefined) p.precio = p.precioNormal;
    if (p.precioPromo !== undefined && p.precio_promo === undefined) p.precio_promo = p.precioPromo;
    if (p.promoActiva !== undefined && p.promo_activa === undefined) p.promo_activa = !!p.promoActiva;
    if (p.imagenUrl !== undefined && p.imagen_url === undefined) p.imagen_url = p.imagenUrl;
    if (p.imagenBase64 !== undefined && p.imagen_base64 === undefined) p.imagen_base64 = p.imagenBase64;

    return this.http.post<any>(this.url_producto, p, { headers: this.jsonHeaders() }).pipe(
      tap(() => this.stockChangedSubject.next()),
      map((prod) => this.normalizarProducto(prod)),
      catchError((err) => {
        console.error('[ApiProductoService] createProducto ERROR', err);
        throw err;
      })
    );
  }

  /** PATCH /producto/:id */
  public updateProducto(id: number, payload: any): Observable<any> {
    const p: any = { ...(payload ?? {}) };
    if (p?.categoria) p.categoria = this.canonCat(p.categoria);

    // compat backend viejo
    if (p.precioNormal !== undefined && p.precio === undefined) p.precio = p.precioNormal;
    if (p.precioPromo !== undefined && p.precio_promo === undefined) p.precio_promo = p.precioPromo;
    if (p.promoActiva !== undefined && p.promo_activa === undefined) p.promo_activa = !!p.promoActiva;
    if (p.imagenUrl !== undefined && p.imagen_url === undefined) p.imagen_url = p.imagenUrl;
    if (p.imagenBase64 !== undefined && p.imagen_base64 === undefined) p.imagen_base64 = p.imagenBase64;

    return this.http.patch<any>(`${this.url_producto}/${id}`, p, { headers: this.jsonHeaders() }).pipe(
      tap(() => this.stockChangedSubject.next()),
      map((prod) => this.normalizarProducto(prod)),
      catchError((err) => {
        console.error('[ApiProductoService] updateProducto ERROR', err);
        throw err;
      })
    );
  }

  /** DELETE /producto/:id */
  public deleteProducto(id: number): Observable<any> {
    return this.http.delete<any>(`${this.url_producto}/${id}`).pipe(
      tap(() => this.stockChangedSubject.next()),
      catchError((err) => {
        console.error('[ApiProductoService] deleteProducto ERROR', err);
        throw err;
      })
    );
  }

  // =========================================================
  // Productos (existente)
  // =========================================================

  /**
   * ✅ CARGA INICIAL (REEMPLAZA LISTA)
   * - Resetea la página
   * - Deduplica por id
   */
  public obtenerPrimerosProductos() {
    // ✅ SIEMPRE es “primera carga”
    this.paginaActualProducto = 1;

    this.http.get<ProductoId[]>(`${this.url_producto}?_page=1`).subscribe({
      next: (resp) => {
        const list = Array.isArray(resp) ? resp : [];
        const normal = list.map((p: any) => this.normalizarProducto(p));
        const dedup = this.dedupeById(normal);

        // ✅ reemplaza lista completa
        this.comListaProd.next(dedup as any);

        // ✅ próxima página para “cargar más”
        this.paginaActualProducto = 2;
      },
      error: (err) => {
        console.warn('GET productos con _page falló, probando sin paginación', err);

        this.http.get<ProductoId[]>(`${this.url_producto}`).subscribe({
          next: (resp2) => {
            const list2 = Array.isArray(resp2) ? resp2 : [];
            const normal2 = list2.map((p: any) => this.normalizarProducto(p));
            const dedup2 = this.dedupeById(normal2);

            this.comListaProd.next(dedup2 as any);
            this.paginaActualProducto = 2;
          },
          error: (err2) => console.error('ERROR obtenerPrimerosProductos', err2),
        });
      },
    });
  }

  /**
   * ✅ CARGAR MÁS (APPEND, DEDUPLICADO)
   * No rompe nada si no lo usas.
   */
  public cargarMasProductos(): Observable<any[]> {
    const page = this.paginaActualProducto;

    return this.http.get<ProductoId[]>(`${this.url_producto}?_page=${page}`).pipe(
      map((resp) => (Array.isArray(resp) ? resp : []).map((p: any) => this.normalizarProducto(p))),
      map((items) => this.dedupeById(items)),
      tap((items) => {
        const current = (this.comListaProd.value ?? []) as any[];
        const merged = this.dedupeById([...current, ...items]);
        this.comListaProd.next(merged as any);
        this.paginaActualProducto = this.paginaActualProducto + 1;
      }),
      catchError((err) => {
        console.error('[ApiProductoService] cargarMasProductos ERROR', err);
        return of([]);
      })
    );
  }

  public getProducto(categoriaProducto: string) {
    const cat = this.canonCat(categoriaProducto);
    return this.http
      .get<any>(`${this.url_producto}?categoria=${encodeURIComponent(cat)}`)
      .pipe(map((x: any) => x));
  }

  public agregarProducto(producto: Producto) {
    return this.http.post(this.url_producto, producto, {
      headers: this.jsonHeaders(),
    });
  }

  public obtenerProductoPorID(id: number): Observable<ProductoId | null> {
    return this.http
      .get<ProductoId | null>(`${this.url_producto}/${id}`)
      .pipe(map((p: any) => (p ? this.normalizarProducto(p) : null)));
  }

  /**
   * ✅ PATCH /producto/:id (stock/campos parciales)
   */
  stockProducto(id: number, patch: ProductoParcial): Observable<any> {
    const p: any = { ...(patch as any) };
    if (p?.categoria) p.categoria = this.canonCat(p.categoria);

    return this.http.patch(`${this.url_producto}/${id}`, p, { headers: this.jsonHeaders() }).pipe(
      tap(() => this.stockChangedSubject.next()),
      map((prod: any) => this.normalizarProducto(prod))
    );
  }

  // =========================================================
  // Carrito (existente)
  // =========================================================

  public getProductoCarrito(idUsuario: string) {
    const params = new HttpParams().set('idUsuario', String(idUsuario));
    return this.http.get<any[]>(`${this.url_carrito}`, { params });
  }

  actualizarCarritoPorProducto(idProducto: number, body: any): Observable<any> {
    return this.http.patch(`${this.url_carrito}/${idProducto}`, body, {
      headers: this.jsonHeaders(),
    });
  }

  addProduct(carro: any): Observable<any> {
    return this.http.post(`${this.url_carrito}`, carro, { headers: this.jsonHeaders() }).pipe(
      tap(() => this.cartItemCount.next(this.cartItemCount.value + 1))
    );
  }

  removeProducto(idProducto: number, idUsuario: string): Observable<any> {
    const params = new HttpParams().set('idUsuario', String(idUsuario));
    return this.http.delete<any>(`${this.url_carrito}/${idProducto}`, { params });
  }

  getCarItemCount() {
    return this.cartItemCount;
  }

  // =========================================================
  // ✅ Detalle del carrito listo para UI (existente)
  // =========================================================
  public obtenerCarritoDetalleParaUI(
    idUsuario: string
  ): Observable<
    Array<{
      id: string;
      nombre: string;
      precio: number;
      cantidad: number;
      imagen?: string | null;
    }>
  > {
    return this.getProductoCarrito(idUsuario).pipe(
      map((items: any[]) => {
        const list = Array.isArray(items) ? items : [];

        const normalizado = list.map((it: any) => {
          const idProducto =
            it?.idProducto ??
            it?.id_producto ??
            it?.productoId ??
            it?.producto_id ??
            it?.producto?.id ??
            it?.id;

          const cantidad = Number(
            it?.cantidad ?? it?.qty ?? it?.cantidadProducto ?? it?.cantidad_producto ?? 1
          );

          const nombre =
            it?.nombre ??
            it?.producto?.nombre ??
            it?.producto?.name ??
            it?.productoNombre ??
            'Producto';

          const precio = Number(
            it?.precio ?? it?.producto?.precio ?? it?.producto?.price ?? it?.precioProducto ?? 0
          );

          const imagen = it?.imagen ?? it?.producto?.imagen ?? it?.producto?.img ?? it?.foto ?? null;

          return {
            id: String(idProducto ?? ''),
            nombre: String(nombre ?? 'Producto'),
            precio: Number.isFinite(precio) ? precio : 0,
            cantidad: Number.isFinite(cantidad) ? cantidad : 1,
            imagen: imagen ? String(imagen) : null,
          };
        });

        this.carritoDetalleSubject.next(normalizado);

        const total = normalizado.reduce((acc, x) => acc + x.precio * x.cantidad, 0);
        this.totalCarrito(String(total));

        return normalizado;
      }),
      catchError((err) => {
        console.error('[ApiProductoService] obtenerCarritoDetalleParaUI ERROR', err);
        this.carritoDetalleSubject.next([]);
        return of([]);
      })
    );
  }

  public retornarCarritoDetalleCache() {
    return this.carritoDetalleSubject.value || [];
  }

  // =========================================================
  // ✅ limpiar carrito post compra (existente)
  // =========================================================
  limpiarCarritoPostCompra(idUsuario: string): Observable<boolean> {
    const params = new HttpParams().set('idUsuario', String(idUsuario));

    return this.http.get<any[]>(`${this.url_carrito}`, { params }).pipe(
      switchMap((items) => {
        const list = items || [];

        if (!list.length) {
          this.totalCarrito('0');
          this.cartItemCount.next(0);
          this.carritoDetalleSubject.next([]);
          return of(true);
        }

        const deletes = list.map((item) => {
          const idProducto = Number(
            item?.idProducto ??
              item?.id_producto ??
              item?.productoId ??
              item?.producto_id ??
              item?.producto?.id ??
              item?.id
          );

          return this.removeProducto(idProducto, idUsuario);
        });

        return forkJoin(deletes).pipe(
          map(() => {
            this.totalCarrito('0');
            this.cartItemCount.next(0);
            this.carritoDetalleSubject.next([]);
            return true;
          })
        );
      }),
      catchError((err) => {
        console.error('[ApiProductoService] limpiarCarritoPostCompra ERROR', err);
        return of(false);
      })
    );
  }

  resetTotalCarritoLocal() {
    this.totalCarrito('0');
    this.cartItemCount.next(0);
    this.carritoDetalleSubject.next([]);
  }

  // =========================================================
  // LocalStorage helpers (existente)
  // =========================================================

  public categoria(categoria: any) {
    localStorage.setItem('nombrecategoria', categoria);
  }
  public retornarcategoria() {
    return localStorage.getItem('nombrecategoria');
  }

  public categoriacrema(categoriacrema: any) {
    localStorage.setItem('crema cat', categoriacrema);
  }
  public retornarcategoriacrema() {
    return localStorage.getItem('crema cat');
  }

  public categoriaperfume(categoriaperfume: any) {
    localStorage.setItem('perfume categoria', categoriaperfume);
  }
  public retornarcategoriaperfume() {
    return localStorage.getItem('perfume categoria');
  }

  public totalCarrito(total: any) {
    localStorage.setItem('total carrito', total);
  }
  public retornarTotal() {
    return localStorage.getItem('total carrito');
  }
}
