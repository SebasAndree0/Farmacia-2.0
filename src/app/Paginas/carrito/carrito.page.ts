import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { ApiProductoService } from '../servicios/api-producto.service';
import { ApiUsuarioService } from '../servicios/api-usuario.service';

// ✅ RxJS
import { of, firstValueFrom } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-carrito',
  templateUrl: './carrito.page.html',
  styleUrls: ['./carrito.page.scss'],
})
export class CarritoPage implements OnInit {
  cart: any[] = [];
  public formulario: FormGroup;
  public usuarioId = '';

  constructor(
    private cartService: ApiProductoService,
    private modalCtrl: ModalController,
    private fb: FormBuilder,
    private apiUsuario: ApiUsuarioService
  ) {
    this.formulario = this.fb.group({
      cantidad: [1],
    });
  }

  ngOnInit() {
    this.usuarioId = this.apiUsuario.retornarId();
    this.cargarCarrito();
  }

  // ✅ (Ionic) cada vez que se abre / vuelve a mostrarse el modal
  ionViewWillEnter() {
    this.cargarCarrito();
  }

  close() {
    this.modalCtrl.dismiss();
  }

  // ✅ COMPRAR: cierra modal devolviendo data (para que la pantalla principal navegue a medio-pago)
  comprar() {
    this.modalCtrl.dismiss({
      action: 'checkout',
      cart: this.cart,
      total: this.getTotal(),
      usuarioId: this.usuarioId,
    });
  }

  /**
   * ✅ Obtiene idProducto (robusto)
   * En tu backend el carrito guarda idProducto dentro de item.id
   */
  private getIdProducto(item: any): number | null {
    const id =
      item?.idProducto ??
      item?.id_producto ??
      item?.productoId ??
      item?.producto_id ??
      item?.producto?.id ??
      item?.id; // ✅ en tu carrito actual: item.id = idProducto

    const n = Number(id);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // ✅ TrackBy para evitar re-render y “saltos” visuales
  // ⚠️ IMPORTANTE: arrow function para que no se pierda el "this"
  trackByCarrito = (index: number, item: any) => {
    const idProducto = this.getIdProducto(item);
    return `${idProducto ?? index}-${item?.idUsuario ?? this.usuarioId}`;
  };

  // ============================
  // ✅ PROMO helpers (para arreglar carritos viejos)
  // ============================
  private getPromoInfoFromProducto(prod: any) {
    const promoActiva = !!(prod?.promoActiva ?? prod?.promo_activa ?? false);
    const precioPromo = Number(prod?.precioPromo ?? prod?.precio_promo ?? 0);
    const precioNormal = Number(prod?.precioNormal ?? prod?.precio ?? 0);

    const precioFinal =
      promoActiva && Number.isFinite(precioPromo) && precioPromo > 0
        ? precioPromo
        : (Number.isFinite(precioNormal) ? precioNormal : 0);

    return {
      promoActiva,
      precioPromo: Number.isFinite(precioPromo) ? precioPromo : 0,
      precioNormal: Number.isFinite(precioNormal) ? precioNormal : 0,
      precioFinal: Number.isFinite(precioFinal) ? precioFinal : 0,
    };
  }

  private itemNeedsPromoFix(item: any): boolean {
    // si ya viene con campos promo, no tocamos
    const hasPromoFields =
      item?.promoActiva !== undefined ||
      item?.precioPromo !== undefined ||
      item?.precioNormal !== undefined;

    return !hasPromoFields;
  }

  // ✅ CARGAR CARRITO (y corregir precio con promo si son items viejos)
  cargarCarrito() {
    this.cartService.getProductoCarrito(this.usuarioId).subscribe({
      next: (res: any[]) => {
        this.cart = res || [];
        console.log('CARRITO:', this.cart);

        // ✅ total local actualizado
        this.cartService.totalCarrito(String(this.getTotal()));

        // ✅ FIX items antiguos: recalcular precio con producto real y guardar promo
        const toFix = (this.cart || []).filter((it) => this.itemNeedsPromoFix(it));
        if (!toFix.length) return;

        toFix.forEach((item) => {
          const idProducto = this.getIdProducto(item);
          if (!idProducto) return;

          this.cartService.obtenerProductoPorID(idProducto).subscribe({
            next: (prod: any) => {
              if (!prod) return;

              const promo = this.getPromoInfoFromProducto(prod);

              // si el precio ya coincide, no tocamos
              const precioActual = Number(item?.precio ?? 0);
              if (Number.isFinite(precioActual) && precioActual === promo.precioFinal) return;

              const patchBody = {
                ...item,
                idUsuario: Number(this.usuarioId),
                precio: promo.precioFinal,

                // ✅ guardar campos promo para UI/checkout
                promoActiva: promo.promoActiva,
                precioPromo: promo.precioPromo,
                precioNormal: promo.precioNormal,
              };

              this.cartService.actualizarCarritoPorProducto(idProducto, patchBody).subscribe({
                next: () => {
                  // recarga suave para reflejar cambios
                  this.cargarCarrito();
                },
                error: (err) => console.error('PATCH promo carrito ERROR', err),
              });
            },
            error: () => {},
          });
        });
      },
      error: (err) => {
        console.error('ERROR CARRITO', err);
      },
    });
  }

  // ============================
  // ✅ STOCK REAL (no usar item.stock)
  // ============================

  private bajarStockReal(idProducto: number) {
    return this.cartService.obtenerProductoPorID(idProducto).pipe(
      switchMap((prod: any) => {
        const stockReal = Number(prod?.stock ?? 0);
        if (stockReal <= 0) throw new Error('SIN_STOCK');
        return this.cartService.stockProducto(idProducto, { stock: stockReal - 1 });
      })
    );
  }

  private subirStockReal(idProducto: number, cant: number) {
    return this.cartService.obtenerProductoPorID(idProducto).pipe(
      switchMap((prod: any) => {
        const stockReal = Number(prod?.stock ?? 0);
        const nuevoStock = stockReal + cant;
        return this.cartService.stockProducto(idProducto, { stock: nuevoStock });
      })
    );
  }

  // ============================
  // ✅ SUMAR PRODUCTO (+)
  // ============================
  incrementarProd(item: any) {
    const idProducto = this.getIdProducto(item);
    if (!idProducto) {
      alert('Producto sin ID (item viejo en carrito)');
      return;
    }

    // 1) baja stock REAL (-1)
    this.bajarStockReal(idProducto).subscribe({
      next: () => {
        // 2) sube cantidad en carrito (+1)
        const nuevoBody = {
          ...item,
          cantidad: Number(item?.cantidad ?? 0) + 1,
          idUsuario: Number(this.usuarioId), // ✅ SIEMPRE el logueado
        };

        this.cartService.actualizarCarritoPorProducto(idProducto, nuevoBody).subscribe({
          next: () => this.cargarCarrito(),
          error: (err) => {
            console.error('PATCH carrito ERROR', err);
            alert('No se pudo actualizar carrito');

            // ⛑️ revert stock si falló el carrito
            this.subirStockReal(idProducto, 1).subscribe({ next: () => {}, error: () => {} });
          },
        });
      },
      error: (err) => {
        console.error('ERROR bajando stock REAL:', err);
        alert(err?.message === 'SIN_STOCK' ? 'Sin stock suficiente' : 'No se pudo actualizar stock');
      },
    });
  }

  // ============================
  // ✅ RESTAR PRODUCTO (-)
  // ============================
  disminuirProd(item: any) {
    const idProducto = this.getIdProducto(item);
    if (!idProducto) {
      alert('Producto sin ID (item viejo en carrito)');
      return;
    }

    const cantidadActual = Number(item?.cantidad ?? 0);

    // caso A: cantidad > 1 → sube stock +1 y baja cantidad -1
    if (cantidadActual > 1) {
      // 1) subir stock REAL (+1)
      this.subirStockReal(idProducto, 1).subscribe({
        next: () => {
          // 2) bajar cantidad carrito (-1)
          const nuevoBody = {
            ...item,
            cantidad: cantidadActual - 1,
            idUsuario: Number(this.usuarioId),
          };

          this.cartService.actualizarCarritoPorProducto(idProducto, nuevoBody).subscribe({
            next: () => this.cargarCarrito(),
            error: (err) => {
              console.error('PATCH carrito ERROR', err);
              alert('No se pudo actualizar carrito');

              // ⛑️ revert stock si falló el carrito (vuelve a bajar 1)
              this.bajarStockReal(idProducto).subscribe({ next: () => {}, error: () => {} });
            },
          });
        },
        error: (err) => {
          console.error('ERROR subiendo stock REAL:', err);
          alert('No se pudo actualizar stock');
        },
      });

      return;
    }

    // caso B: cantidad == 1 → eliminar (y devuelve stock +1)
    this.removeCartItem(item);
  }

  // ============================
  // ✅ ELIMINAR (devuelve stock REAL +cantidad y luego borra)
  // ============================
  removeCartItem(item: any) {
    const idProducto = this.getIdProducto(item);
    if (!idProducto) {
      alert('Producto sin ID');
      return;
    }

    const cant = Number(item?.cantidad ?? 1);

    this.subirStockReal(idProducto, cant)
      .pipe(
        switchMap(() => this.cartService.removeProducto(idProducto, this.usuarioId)),
        catchError((err) => {
          console.error('removeCartItem ERROR:', err);
          alert('No se pudo eliminar / restaurar stock');
          return of(null);
        })
      )
      .subscribe((ok) => {
        if (ok !== null) {
          alert('Producto eliminado 🗑️');
          this.cargarCarrito();
        }
      });
  }

  // ============================
  // ✅ BORRAR TODO (devuelve stock y elimina todo)
  // ============================
  async borrarTodo() {
    if (!this.cart?.length) return;

    const ok = confirm('¿Borrar todo el carrito? Se devolverá el stock.');
    if (!ok) return;

    try {
      for (const item of this.cart) {
        const idProducto = this.getIdProducto(item);
        if (!idProducto) continue;

        const cant = Number(item?.cantidad ?? 1);

        // 1) devolver stock REAL (+cant)
        await firstValueFrom(this.subirStockReal(idProducto, cant));

        // 2) eliminar del carrito
        await firstValueFrom(this.cartService.removeProducto(idProducto, this.usuarioId));
      }

      // 3) reset total local
      this.cartService.resetTotalCarritoLocal();

      alert('Carrito borrado ✅');
      this.cargarCarrito();
    } catch (e) {
      console.error('borrarTodo ERROR', e);
      alert('No se pudo borrar todo el carrito.');
      this.cargarCarrito();
    }
  }

  // ✅ TOTAL (ya respeta promo porque item.precio será precioFinal)
  getTotal() {
    return this.cart.reduce(
      (acc, item) => acc + Number(item?.precio ?? 0) * Number(item?.cantidad ?? 0),
      0
    );
  }

  // ✅ REFRESH
  handleRefresh(event: any) {
    this.cargarCarrito();
    event.target.complete();
  }
}
