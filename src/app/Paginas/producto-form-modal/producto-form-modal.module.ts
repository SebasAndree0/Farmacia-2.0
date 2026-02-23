import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { ProductoFormModalPage } from './producto-form-modal.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule, // ✅ necesario para ion-button/ion-input/ion-label, etc.
  ],
  declarations: [ProductoFormModalPage],
})
export class ProductoFormModalPageModule {}
