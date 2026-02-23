import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { IonicModule } from '@ionic/angular';

import { ProductoQfPageRoutingModule } from './producto-qf-routing.module';
import { ProductoQfPage } from './producto-qf.page';

import { ApiProductoService } from '../servicios/api-producto.service';

// ✅ IMPORTA EL MODULO DEL MODAL
import { ProductoFormModalPageModule } from '../producto-form-modal/producto-form-modal.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ProductoQfPageRoutingModule,
    HttpClientModule,

    // ✅ AQUI
    ProductoFormModalPageModule,
  ],
  declarations: [ProductoQfPage],
  providers: [ApiProductoService],
})
export class ProductoQfPageModule {}
