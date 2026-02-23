import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ModalController } from '@ionic/angular';
import { CarritoPage } from '../carrito/carrito.page';
import { ApiProductoService } from '../servicios/api-producto.service';

@Component({
  selector: 'app-producto',
  templateUrl: './producto.page.html',
  styleUrls: ['./producto.page.scss'],
})
export class ProductoPage implements OnInit {

  @ViewChild(IonInfiniteScroll)
  public scroll: IonInfiniteScroll;
  public data: any = []
  public results = [...this.data];

  constructor(
    public servicio: ApiProductoService,
    private router: Router,
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {
    this.servicio.obtenerPrimerosProductos();
    this.servicio.listaProducto$.subscribe(resp => {
      this.data = resp;
      this.results = this.data;
      console.log("estos datitos tengo:", this.data);
      if (this.scroll) {
        this.scroll.complete();
      }
    })
  }
  handleRefresh(event) {
    setTimeout(() => {
      // Any calls to load data go here
      event.target.complete();
    }, 2000);
  };

  handleChange(event) {
    const query = event.target.value.toLowerCase();
    this.results = this.data;
    if (query && query.trim() != ' ') {
      this.results = this.results.filter((data: any) => {
        return (data.nombre.toLowerCase().indexOf(query.toLowerCase()) > -1)||(data.categoria.toLowerCase().indexOf(query.toLowerCase()) > -1)||(data.marca.toLowerCase().indexOf(query.toLowerCase()) > -1);
      });
    }
  }
  public openMedicamento(){
    var categoria ="medicamentos";
    this.servicio.categoria(categoria);
    this.router.navigate(['/medicamentos']);

  }
  public openCremas(){
    var categoria ="cremas";
    this.servicio.categoriacrema(categoria);
    this.router.navigate(['/cremas']);

  }

  public openPerfumes(){
    var categoria ="perfumes";
    this.servicio.categoriaperfume(categoria);
    this.router.navigate(['/perfumes']);
}

async openCart(){
  let modal= await this.modalCtrl.create({
    component: CarritoPage,
    cssClass: 'carrito'
  });
  modal.present();

}



}
