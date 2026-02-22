import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { IonInfiniteScroll } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { ApiUsuarioService } from '../servicios/api-usuario.service';

@Component({
  selector: 'app-roles',
  templateUrl: './roles.page.html',
  styleUrls: ['./roles.page.scss'],
})
export class RolesPage implements OnInit, OnDestroy {
  @ViewChild(IonInfiniteScroll) scroll?: IonInfiniteScroll;

  public data: any[] = [];
  public results: any[] = [];

  private sub?: Subscription;

  constructor(public servicio: ApiUsuarioService) {}

  ngOnInit() {
    // 1) Pedimos data una vez
    this.cargarUsuarios();

    // 2) Nos suscribimos UNA sola vez al observable
    this.sub = this.servicio.listaUsuario$.subscribe((resp: any[]) => {
      this.data = Array.isArray(resp) ? resp : [];
      this.results = [...this.data];

      // si estabas usando infinite scroll, lo completamos
      this.scroll?.complete();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  // Si quieres refrescar cada vez que entras a la página:
  ionViewWillEnter() {
    this.cargarUsuarios();
  }

  private cargarUsuarios() {
    this.servicio.obtenerPrimerosUsuarios();
  }

  // Refresher (pull to refresh)
  async handleRefresh(event: any) {
    this.cargarUsuarios();

    // pequeño delay solo para que se vea el spinner (opcional)
    setTimeout(() => {
      event?.target?.complete?.();
    }, 600);
  }

  // Search
  handleChange(event: any) {
    const raw = (event?.target?.value ?? '').toString();
    const query = raw.trim().toLowerCase();

    if (!query) {
      this.results = [...this.data];
      return;
    }

    this.results = this.data.filter((u: any) => {
      const nombre = (u?.nombre ?? '').toString().toLowerCase();
      const tipo = (u?.tipo ?? '').toString().toLowerCase();
      return nombre.includes(query) || tipo.includes(query);
    });
  }

  /* =========================
     FOTO FICTICIA PRO (avatar)
     ========================= */

  getPhoto(detalles: any): string {
    // Si viene imagen real desde tu API, úsala
    const img = (detalles?.img ?? '').toString().trim();
    if (img.length > 5) return img;

    const tipo = (detalles?.tipo ?? '').toString().toLowerCase();
    const seed = encodeURIComponent((detalles?.nombre ?? 'user').toString().trim());

    // Avatares pro distintos según rol
    if (tipo.includes('admin')) {
      return `https://api.dicebear.com/7.x/avataaars-neutral/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
    }

    if (tipo.includes('qf') || tipo.includes('quim') || tipo.includes('farm')) {
      return `https://api.dicebear.com/7.x/personas/svg?seed=${seed}&backgroundColor=c7f9cc,b9fbc0`;
    }

    // cliente por defecto
    return `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${seed}&backgroundColor=ffd5dc,ffdfbf`;
  }

  badgeClass(tipo: string): string {
    const t = (tipo ?? '').toLowerCase();
    if (t.includes('admin')) return 'admin';
    if (t.includes('qf') || t.includes('quim') || t.includes('farm')) return 'qf';
    if (t.includes('client')) return 'cliente';
    return 'otro';
  }

  onImgError(ev: any, detalles: any) {
    // Si falla la imagen real, cae al avatar ficticio
    try {
      ev.target.src = this.getPhoto({ ...detalles, img: '' });
    } catch {}
  }
}
