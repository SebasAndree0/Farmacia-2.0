import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AnimationController, ModalController, ToastController, LoadingController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { Usuario } from '../modelos/usuario';
import { ApiUsuarioService } from '../servicios/api-usuario.service';
import { CarritoPage } from '../carrito/carrito.page';

type UsuarioApi = Usuario & { id: any; nombre: string; contraseña: string; tipo: string };

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  @ViewChild('iconoAnim', { read: ElementRef }) iconoAnim!: ElementRef;

  formularioLogin: FormGroup;
  usuarios: Usuario[] = [];

  isLoading = false;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private apiUsuario: ApiUsuarioService,
    private router: Router,
    private http: HttpClient,
    private animationCtrl: AnimationController,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {
    this.formularioLogin = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20)]],
      contraseña: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20)]],
    });
  }

  ngOnInit() {
    // Si tu servicio ya trae usuarios, lo dejamos ok.
    this.apiUsuario.getUsuario().subscribe({
      next: (data) => (this.usuarios = data),
      error: () => {
        // no bloqueamos la app por esto
      },
    });
  }

  campo(control: string) {
    return this.formularioLogin.get(control);
  }

  showErrors(control: string) {
    const c = this.campo(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async ingresar() {
    if (this.isLoading) return;

    if (this.formularioLogin.invalid) {
      this.formularioLogin.markAllAsTouched();
      this.toast('Revisa los campos antes de ingresar.', 'warning');
      this.animacion();
      return;
    }

    const f = this.formularioLogin.value as { nombre: string; contraseña: string };
    const tipoQF = 'Quimico Farmaceutico';

    this.isLoading = true;
    const loader = await this.loadingCtrl.create({
      message: 'Validando credenciales...',
      spinner: 'crescent',
      backdropDismiss: false,
    });
    await loader.present();

    try {
      const res = await firstValueFrom(this.http.get<UsuarioApi[]>(this.apiUsuario.url_usuario));

      const user = res.find((a) => a.nombre === f.nombre && a.contraseña === f.contraseña);

      if (!user) {
        await this.toast('Datos incorrectos. Intenta nuevamente.', 'danger');
        this.animacion();
        return;
      }

      // Guardamos info en tu service (como ya lo hacías)
      this.apiUsuario.idUsuario(user.id);
      this.apiUsuario.tipoUsuario(user.tipo);

      if (user.tipo === tipoQF) {
        await this.toast('Químico Farmacéutico logueado ✅', 'success');
        this.router.navigate(['/producto-qf']);
      } else if (user.tipo === 'cliente') {
        this.apiUsuario.ingresoUsuario('true');
        this.apiUsuario.nombreUsuario(user.nombre);
        await this.toast('Cliente logueado ✅', 'success');
        this.router.navigate(['/']);
      } else {
        await this.toast('Admin logueado ✅', 'success');
        this.router.navigate(['/roles']);
      }

      this.formularioLogin.reset();
      this.showPassword = false;
    } catch (e) {
      await this.toast('Error conectando con el servidor/API.', 'danger');
    } finally {
      this.isLoading = false;
      await loader.dismiss();
    }
  }

  animacion() {
    if (!this.iconoAnim?.nativeElement) return;

    const a = this.animationCtrl
      .create('logo-bounce')
      .addElement(this.iconoAnim.nativeElement)
      .duration(650)
      .iterations(1)
      .keyframes([
        { offset: 0, transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
        { offset: 0.35, transform: 'scale(0.92) rotate(-2deg)', filter: 'brightness(1.1)' },
        { offset: 0.7, transform: 'scale(1.06) rotate(2deg)', filter: 'brightness(1.2)' },
        { offset: 1, transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
      ]);

    a.play();
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

  async openCart() {
    const modal = await this.modalCtrl.create({
      component: CarritoPage,
      cssClass: 'carrito-modal',
    });
    await modal.present();
  }
}
