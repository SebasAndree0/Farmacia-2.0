import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular';
import { Subscription, switchMap } from 'rxjs';
import { finalize, take, timeout } from 'rxjs/operators';
import { UsuarioConIdo } from '../modelos/usuario';
import { ApiUsuarioService } from '../servicios/api-usuario.service';

@Component({
  selector: 'app-eliminar-usuario',
  templateUrl: './eliminar-usuario.page.html',
  styleUrls: ['./eliminar-usuario.page.scss'],
})
export class EliminarUsuarioPage implements OnInit, OnDestroy {
  public idActiva = 0;
  public usuarioactivo?: UsuarioConIdo;

  private sub?: Subscription;
  private deleting = false;

  constructor(
    private rutaActiva: ActivatedRoute,
    private router: Router,
    private apiUsuario: ApiUsuarioService,
    private alerta: AlertController,
    private loadingCtrl: LoadingController
  ) {}

  ngOnInit() {
    this.sub = this.rutaActiva.paramMap
      .pipe(
        switchMap((parametros) => {
          const raw = parametros.get('idUsuario');
          const id = Number(raw);

          if (!raw || Number.isNaN(id) || id <= 0) {
            this.router.navigate(['/roles']);
            throw new Error('ID inválido');
          }

          this.idActiva = id;
          return this.apiUsuario.obtenerUsuarioPorID(this.idActiva);
        })
      )
      .subscribe({
        next: (datos) => {
          if (datos) this.usuarioactivo = datos;
          else this.router.navigate(['/roles']);
        },
        error: () => this.router.navigate(['/roles']),
      });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  // Botón Eliminar => primero confirma
  public async borrar() {
    if (!this.idActiva || this.deleting) return;

    const alert = await this.alerta.create({
      header: '¿Estás seguro?',
      message: 'Esta acción eliminará el usuario definitivamente.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Sí, eliminar',
          role: 'confirm',
          handler: () => this.confirmarBorrado(),
        },
      ],
    });

    await alert.present();
  }

  // Aquí recién borra
  private async confirmarBorrado() {
    if (!this.idActiva || this.deleting) return;

    this.deleting = true;

    const loading = await this.loadingCtrl.create({
      message: 'Eliminando usuario...',
      spinner: 'crescent',
      backdropDismiss: false,
    });

    await loading.present();

    // LOGS para ver si entra o no al delete
    console.log('[DELETE] idActiva =', this.idActiva);

    this.apiUsuario
      .eliminarUsuarioPorID(this.idActiva)
      .pipe(
        take(1),
        timeout(10000),
        finalize(async () => {
          try { await loading.dismiss(); } catch {}
          this.deleting = false;
        })
      )
      .subscribe({
        next: (resp) => {
          console.log('[DELETE] OK resp =', resp);
          this.router.navigate(['/roles']);
        },
        error: async (err) => {
          console.error('[DELETE] ERROR =', err);

          const errAlert = await this.alerta.create({
            header: 'No se pudo eliminar',
            message:
              'La API no respondió o falló. Revisa la URL del delete / backend.',
            buttons: ['OK'],
          });
          await errAlert.present();
        },
      });
  }

  /* ===== Avatar ficticio pro ===== */
  getPhoto(detalles: any): string {
    const tipo = (detalles?.tipo ?? '').toString().toLowerCase();
    const seed = encodeURIComponent((detalles?.nombre ?? 'user').toString().trim());

    if (tipo.includes('admin')) {
      return `https://api.dicebear.com/7.x/avataaars-neutral/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
    }
    if (tipo.includes('qf') || tipo.includes('quim') || tipo.includes('farm')) {
      return `https://api.dicebear.com/7.x/personas/svg?seed=${seed}&backgroundColor=c7f9cc,b9fbc0`;
    }
    return `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${seed}&backgroundColor=ffd5dc,ffdfbf`;
  }

  badgeClass(tipo: string): string {
    const t = (tipo ?? '').toLowerCase();
    if (t.includes('admin')) return 'admin';
    if (t.includes('qf') || t.includes('quim') || t.includes('farm')) return 'qf';
    if (t.includes('client')) return 'cliente';
    return 'otro';
  }

  onImgError(ev: any) {
    try {
      if (!this.usuarioactivo) return;
      ev.target.src = this.getPhoto(this.usuarioactivo);
    } catch {}
  }
}
