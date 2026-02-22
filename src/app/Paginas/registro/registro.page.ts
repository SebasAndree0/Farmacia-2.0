import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiUsuarioService } from '../servicios/api-usuario.service';
import { LoadingController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
})
export class RegistroPage implements OnInit {
  formulario2: FormGroup;

  isLoading = false;
  showPassword = false;

  constructor(
    private formC: FormBuilder,
    private apiUsuario: ApiUsuarioService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.formulario2 = this.formC.group({
      nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(10)]],
      contraseña: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(10)]],
      tipo: ['cliente'],
    });
  }

  ngOnInit() {}

  campo(control: string) {
    return this.formulario2.get(control);
  }

  showErrors(control: string) {
    const c = this.campo(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async guardarCliente(): Promise<void> {
    if (this.isLoading) return;

    if (this.formulario2.invalid) {
      this.formulario2.markAllAsTouched();
      await this.toast('Revisa los campos antes de guardar.', 'warning');
      return;
    }

    this.isLoading = true;
    const loader = await this.loadingCtrl.create({
      message: 'Creando cuenta...',
      spinner: 'crescent',
      backdropDismiss: false,
    });
    await loader.present();

    try {
      const payload = {
        ...this.formulario2.value,
        tipo: 'cliente', // aseguramos que siempre sea cliente
      };

      const resultado = await firstValueFrom(this.apiUsuario.agregarUsuario(payload));

      if (resultado) {
        this.formulario2.reset({ tipo: 'cliente' });
        this.formulario2.markAsPristine();
        this.formulario2.markAsUntouched();
        this.showPassword = false;

        await this.toast('Cuenta creada ✅', 'success');
        this.router.navigate(['/login']);
      } else {
        await this.toast('No se pudo crear la cuenta.', 'danger');
      }
    } catch (e) {
      await this.toast('Error al guardar. Intenta nuevamente.', 'danger');
    } finally {
      this.isLoading = false;
      await loader.dismiss();
    }
  }

  private async toast(message: string, color: 'success' | 'danger' | 'warning' | 'medium' = 'medium') {
    const t = await this.toastCtrl.create({
      message,
      duration: 1800,
      color,
      position: 'top',
    });
    await t.present();
  }
}
