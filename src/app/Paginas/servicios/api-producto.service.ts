// C:\Farmacia2026\Farmacia-2.0\src\app\Paginas\servicios\api-producto.service.ts

import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, tap, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

import { Carrito } from '../modelos/carrito';
import { Producto, ProductoId, ProductoParcial } from '../modelos/productos';

@Injectable({
  providedIn: 'root',
})
export class ApiProductoService {
  private readonly API = environment.apiUrl;

  // Rutas base
  private readonly url_producto = `${this.API}/producto`;
  public readonly url_carrito = `${this.API}/carrito`;

  private comListaProd = new BehaviorSubject<Array<ProductoId>>([]);
  public listaProducto$ = this.comListaProd.asObservable();
  public paginaActualProducto = 1;

  private cartItemCount = new BehaviorSubject(0);

  // ✅ EVENTO PARA ACTUALIZAR STOCK SIN F5
  private stockChangedSubject = new Subject<void>();
  public stockChanged$ = this.stockChangedSubject.asObservable();

  // ✅ NUEVO: cache local del detalle del carrito (para pantallas como MedioPago)
  private carritoDetalleSubject = new BehaviorSubject<any[]>([]);
  public carritoDetalle$ = this.carritoDetalleSubject.asObservable();

  constructor(private http: HttpClient) {}

  // ---------------------------
  // Helpers
  // ---------------------------
  private jsonHeaders() {
    return new HttpHeaders({ 'Content-Type': 'application/json;charset=utf-8' });
  }

  // ---------------------------
  // Productos
  // ---------------------------

  public obtenerPrimerosProductos() {
    // intenta con paginación (si existiera)
    this.http.get<ProductoId[]>(`${this.url_producto}?_page=1`).subscribe({
      next: (resp) => {
        this.paginaActualProducto = this.paginaActualProducto + 1;
        this.comListaProd.next(resp || []);
      },
      error: (err) => {
        // fallback sin paginación
        console.warn('GET productos con _page falló, probando sin paginación', err);
        this.http.get<ProductoId[]>(`${this.url_producto}`).subscribe({
          next: (resp2) => {
            this.paginaActualProducto = this.paginaActualProducto + 1;
            this.comListaProd.next(resp2 || []);
          },
          error: (err2) => console.error('ERROR obtenerPrimerosProductos', err2),
        });
      },
    });
  }

  public getProducto(categoriaProducto: string) {
    return this.http.get<any>(
      `${this.url_producto}?categoria=${encodeURIComponent(categoriaProducto)}`
    );
  }

  public agregarProducto(producto: Producto) {
    return this.http.post(this.url_producto, producto, {
      headers: this.jsonHeaders(),
    });
  }

  public obtenerProductoPorID(id: number): Observable<ProductoId | null> {
    return this.http.get<ProductoId | null>(`${this.url_producto}/${id}`);
  }

  /**
   * ✅ PATCH /producto/:id (stock/campos parciales)
   * ✅ EMITE stockChanged$ para que otras páginas se refresquen sin F5
   */
  stockProducto(id: number, patch: ProductoParcial): Observable<any> {
    return this.http
      .patch(`${this.url_producto}/${id}`, patch, { headers: this.jsonHeaders() })
      .pipe(
        tap(() => {
          // avisa que cambió stock
          this.stockChangedSubject.next();
        })
      );
  }

  // ---------------------------
  // Carrito
  // ---------------------------

  // ✅ GET /carrito?idUsuario=...
  public getProductoCarrito(idUsuario: string) {
    const params = new HttpParams().set('idUsuario', String(idUsuario));
    return this.http.get<any[]>(`${this.url_carrito}`, { params });
  }

  /**
   * ✅ PATCH /carrito/:id
   * 🔥 :id = idProducto (data.id) según tu backend actual
   * body debe incluir idUsuario
   */
  actualizarCarritoPorProducto(idProducto: number, body: any): Observable<any> {
    return this.http.patch(`${this.url_carrito}/${idProducto}`, body, {
      headers: this.jsonHeaders(),
    });
  }

  /**
   * ✅ POST /carrito
   * tu backend:
   * - si ya existe (usuario + idProducto), suma cantidad
   * - si no existe, crea
   */
  addProduct(carro: any): Observable<any> {
    return this.http.post(`${this.url_carrito}`, carro, { headers: this.jsonHeaders() }).pipe(
      tap(() => {
        this.cartItemCount.next(this.cartItemCount.value + 1);
      })
    );
  }

  /**
   * ✅ DELETE /carrito/:id
   * 🔥 :id = idProducto
   * 🔥 pasamos idUsuario como query para borrar solo del usuario
   */
  removeProducto(idProducto: number, idUsuario: string): Observable<any> {
    const params = new HttpParams().set('idUsuario', String(idUsuario));
    return this.http.delete<any>(`${this.url_carrito}/${idProducto}`, { params });
  }

  getCarItemCount() {
    return this.cartItemCount;
  }

  // ---------------------------
  // ✅ NUEVO: Detalle del carrito listo para tu carrusel
  // ---------------------------
  /**
   * Devuelve el carrito del usuario desde backend y lo normaliza para UI.
   * - Además guarda una copia en carritoDetalle$ (para que las páginas escuchen cambios).
   */
  public obtenerCarritoDetalleParaUI(idUsuario: string): Observable<
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
          // idProducto puede venir en varias formas en tu backend actual
          const idProducto =
            it?.idProducto ??
            it?.id_producto ??
            it?.productoId ??
            it?.producto_id ??
            it?.producto?.id ??
            it?.id; // a veces item.id es idProducto

          // cantidad puede venir como cantidad / qty / cantidadProducto / etc.
          const cantidad = Number(
            it?.cantidad ?? it?.qty ?? it?.cantidadProducto ?? it?.cantidad_producto ?? 1
          );

          // nombre y precio pueden estar dentro de producto o directo
          const nombre =
            it?.nombre ??
            it?.producto?.nombre ??
            it?.producto?.name ??
            it?.productoNombre ??
            'Producto';

          const precio = Number(
            it?.precio ??
              it?.producto?.precio ??
              it?.producto?.price ??
              it?.precioProducto ??
              0
          );

          const imagen =
            it?.imagen ??
            it?.producto?.imagen ??
            it?.producto?.img ??
            it?.foto ??
            null;

          return {
            id: String(idProducto ?? ''),
            nombre: String(nombre ?? 'Producto'),
            precio: Number.isFinite(precio) ? precio : 0,
            cantidad: Number.isFinite(cantidad) ? cantidad : 1,
            imagen: imagen ? String(imagen) : null,
          };
        });

        // ✅ actualiza subject (útil si quieres suscribirte en otras páginas)
        this.carritoDetalleSubject.next(normalizado);

        // ✅ opcional: recalcular y guardar total en localStorage para mantener tu app igual
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

  /**
   * ✅ NUEVO: acceso rápido al último carrito normalizado (sin volver a pegarle al backend)
   */
  public retornarCarritoDetalleCache() {
    return this.carritoDetalleSubject.value || [];
  }

  // ---------------------------
  // ✅ NUEVO: limpiar carrito post compra (NO devuelve stock)
  // ---------------------------

  /**
   * ✅ Limpia el carrito del usuario SOLO borrando registros (NO devuelve stock)
   * Útil cuando la compra fue confirmada.
   */
  limpiarCarritoPostCompra(idUsuario: string): Observable<boolean> {
    const params = new HttpParams().set('idUsuario', String(idUsuario));

    return this.http.get<any[]>(`${this.url_carrito}`, { params }).pipe(
      switchMap((items) => {
        const list = items || [];

        if (!list.length) {
          this.totalCarrito('0');
          this.cartItemCount.next(0);
          this.carritoDetalleSubject.next([]); // ✅ NUEVO
          return of(true);
        }

        const deletes = list.map((item) => {
          const idProducto = Number(
            item?.idProducto ??
              item?.id_producto ??
              item?.productoId ??
              item?.producto_id ??
              item?.producto?.id ??
              item?.id // ✅ en tu carrito actual: item.id = idProducto
          );

          return this.removeProducto(idProducto, idUsuario);
        });

        return forkJoin(deletes).pipe(
          map(() => {
            this.totalCarrito('0');
            this.cartItemCount.next(0);
            this.carritoDetalleSubject.next([]); // ✅ NUEVO
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

  /**
   * ✅ Reset total carrito local (por si tu UI depende de localStorage)
   */
  resetTotalCarritoLocal() {
    this.totalCarrito('0');
    this.cartItemCount.next(0);
    this.carritoDetalleSubject.next([]); // ✅ NUEVO
  }

  // ---------------------------
  // LocalStorage helpers
  // ---------------------------

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
