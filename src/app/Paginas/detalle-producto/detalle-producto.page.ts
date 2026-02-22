// C:\Farmacia2026\Farmacia-2.0\src\app\Paginas\detalle-producto\detalle-producto.page.ts

import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiProductoService } from '../servicios/api-producto.service';
import { ApiUsuarioService } from '../servicios/api-usuario.service';
import { ProductoId } from '../modelos/productos';
import { CarritoPage } from '../carrito/carrito.page';
import { AnimationController, ModalController } from '@ionic/angular';

@Component({
  selector: 'app-detalle-producto',
  templateUrl: './detalle-producto.page.html',
  styleUrls: ['./detalle-producto.page.scss'],
})
export class DetalleProductoPage implements OnInit {
  @ViewChild('cartBtn', { read: ElementRef }) cartBnt!: ElementRef;
  @ViewChild('cartFabBtn', { read: ElementRef }) cartFabBnt!: ElementRef;

  public idActiva: number = 0;
  public productoActivo!: ProductoId;

  public usuarioId = '';
  public nombreUsuario = '';

  constructor(
    private rutaActiva: ActivatedRoute,
    private router: Router,
    private apiProducto: ApiProductoService,
    private apiUsuario: ApiUsuarioService,
    private http: HttpClient,
    private modalCtrl: ModalController,
    private animationCtrl: AnimationController
  ) {}

  ngOnInit() {
    this.usuarioId = this.apiUsuario.retornarId();
    this.nombreUsuario = this.apiUsuario.retornarUsuario();

    // ✅ cuando cambie stock desde carrito u otra pantalla -> refresca sin F5
    this.apiProducto.stockChanged$.subscribe(() => {
      if (this.idActiva) this.recargarProducto();
    });

    this.rutaActiva.paramMap.subscribe((parametros) => {
      // Si tu route usa :idProducto, está bien.
      // Si usa :id, cámbialo por 'id'.
      this.idActiva = Number(parametros.get('idProducto'));

      if (!this.idActiva) {
        this.router.navigate(['']);
        return;
      }

      this.recargarProducto();
    });
  }

  addToCart(nombre: string, precio: number, imagen: string, _cantidad: number, stock: number) {
    const stockActual = Number(stock ?? 0);

    if (stockActual <= 0) {
      alert('Sin stock suficiente');
      return;
    }

    // 1) bajar stock del producto (esto ya dispara stockChanged$ en el service)
    this.apiProducto.stockProducto(this.idActiva, { stock: stockActual - 1 }).subscribe({
      next: () => {
        // 2) POST /carrito (backend evita duplicados y suma cantidad)
        const carrito: any = {
          id: this.idActiva, // 👈 backend usa "id" como idProducto
          nombre,
          precio: Number(precio),
          imagen,
          idUsuario: Number(this.usuarioId),
          cantidad: 1,
          stock: stockActual - 1, // opcional para UI
          nombreUsuario: this.nombreUsuario,
        };

        this.apiProducto.addProduct(carrito).subscribe({
          next: async () => {
            // opcional: animación
            // this.addToCartCarrito();

            // refrescar producto (stock nuevo) (extra por si acaso)
            this.recargarProducto();

            // abrir carrito modal grande
            await this.openCart();
          },
          error: (err) => {
            console.error('POST carrito ERROR', err);
            alert('Error al agregar al carrito ❌');

            // ⛑️ revert de stock si falló el carrito (esto también dispara stockChanged$)
            this.apiProducto.stockProducto(this.idActiva, { stock: stockActual }).subscribe({
              next: () => this.recargarProducto(),
              error: () => {},
            });
          },
        });
      },
      error: (err) => {
        console.error('PATCH stock ERROR', err);
        alert('No se pudo actualizar stock ❌');
      },
    });
  }

  private recargarProducto() {
    this.apiProducto.obtenerProductoPorID(this.idActiva).subscribe({
      next: (datos) => {
        if (datos) this.productoActivo = datos;
        else this.router.navigate(['']);
      },
      error: (err) => {
        console.error('ERROR obtenerProductoPorID', err);
        alert('Error cargando producto ❌');
      },
    });
  }

  // ✅ ABRE CARRITO y si el usuario aprieta "COMPRAR" -> navega a /medio-pago
  async openCart() {
    const modal = await this.modalCtrl.create({
      component: CarritoPage,
      cssClass: 'carrito-modal-grande',
      componentProps: {
        idUsuario: this.usuarioId,
        nombreUsuario: this.nombreUsuario,
      },
    });

    await modal.present();

    // ✅ clave: escuchar el dismiss
    const { data } = await modal.onDidDismiss();

    if (data?.action === 'checkout') {
      await this.router.navigate(['/medio-pago'], {
        state: {
          cart: data.cart ?? [],
          total: data.total ?? 0,
          usuarioId: data.usuarioId ?? this.usuarioId,
        },
      });
    }
  }

  addToCartCarrito() {
    if (!this.cartBnt?.nativeElement || !this.cartFabBnt?.nativeElement) return;

    const cartAnimation = this.animationCtrl
      .create('cart-animation')
      .addElement(this.cartBnt.nativeElement)
      .keyframes([
        { offset: 0, transform: 'scale(1)' },
        { offset: 0.5, transform: 'scale(1.2)' },
        { offset: 0.8, transform: 'scale(0.9)' },
        { offset: 1, transform: 'scale(1)' },
      ]);

    const cartColorAnimation = this.animationCtrl
      .create('cart-color-animation')
      .addElement(this.cartFabBnt.nativeElement)
      .fromTo('transform', 'rotate(0deg)', 'rotate(45deg)');

    const parent = this.animationCtrl
      .create('parent')
      .duration(300)
      .easing('ease-out')
      .iterations(2)
      .direction('alternate')
      .addAnimation([cartColorAnimation, cartAnimation]);

    parent.play();
  }

  handleRefresh(event: any) {
    setTimeout(() => {
      this.recargarProducto();
      event.target.complete();
    }, 600);
  }
}
