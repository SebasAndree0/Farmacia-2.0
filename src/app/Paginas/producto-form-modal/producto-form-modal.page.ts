// C:\Farmacia2026\Farmacia-2.0\src\app\Paginas\producto-form-modal\producto-form-modal.page.ts

import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiProductoService, CategoriaUI } from '../servicios/api-producto.service';

type Mode = 'new' | 'edit';

@Component({
  selector: 'app-producto-form-modal',
  templateUrl: './producto-form-modal.page.html',
  styleUrls: ['./producto-form-modal.page.scss'],
})
export class ProductoFormModalPage implements OnInit, OnDestroy {
  @Input() mode: Mode = 'new';
  @Input() producto: any | null = null;

  // si desde afuera te pasan categorías, las usamos solo como extra (no como fuente principal)
  @Input() categorias: CategoriaUI[] = [];

  form!: FormGroup;
  saving = false;

  imgPreview: string = 'assets/placeholder.png';

  // ✅ lista REAL que usa el select
  public categoriasUI: CategoriaUI[] = [];

  // ✅ para performance del select
  trackByCat = (_: number, c: any) => String(c?.slug ?? '');

  private subs = new Subscription();

  constructor(
    private fb: FormBuilder,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private api: ApiProductoService
  ) {}

  async ngOnInit() {
    const p = this.producto ?? {};

    // 1) defaults (CANÓNICOS)
    this.categoriasUI = this.mergeCats(
      [
        { slug: 'medicamento', label: 'Medicamentos' },
        { slug: 'cremas', label: 'Cremas' },
        { slug: 'perfumes', label: 'Perfumes' },
      ],
      Array.isArray(this.categorias) ? this.categorias : []
    );

    // 2) crea el form
    const precioNormal = Number(p?.precioNormal ?? p?.precio ?? 0);
    const promoActiva = !!(
      p?.promoActiva ??
      (Number(p?.precioPromo ?? p?.precio_promo ?? 0) > 0)
    );
    const precioPromo = Number(p?.precioPromo ?? p?.precio_promo ?? 0);

    const categoriaRaw = (p?.categoria ?? p?.categoria_slug ?? '').toString().trim();
    let categoriaInicial = this.slugify(categoriaRaw);
    // ✅ compat: medicamentos -> medicamento
    if (categoriaInicial === 'medicamentos') categoriaInicial = 'medicamento';
    categoriaInicial = categoriaInicial || this.categoriasUI[0]?.slug || 'medicamento';

    this.form = this.fb.group({
      nombre: [p?.nombre ?? '', [Validators.required, Validators.minLength(2)]],
      marca: [p?.marca ?? '', [Validators.required, Validators.minLength(2)]],

      // ✅ este control debe existir para ion-select
      categoria: [categoriaInicial, [Validators.required]],

      stock: [Number(p?.stock ?? 0), [Validators.required, Validators.min(0)]],

      precioNormal: [precioNormal, [Validators.required, Validators.min(0)]],
      promoActiva: [promoActiva],
      precioPromo: [precioPromo, [Validators.min(0)]],

      imagenUrl: [
        p?.imagenUrl ??
          p?.imagen_url ??
          (typeof p?.imagen === 'string' ? p.imagen : ''),
      ],
      imagenBase64: [p?.imagenBase64 ?? p?.imagen_base64 ?? ''],
    });

    // 3) promo rules
    this.subs.add(
      this.form.get('promoActiva')!.valueChanges.subscribe(() => this.enforcePromoRules())
    );
    this.enforcePromoRules();

    // 4) preview
    this.syncPreview();
    this.subs.add(this.form.get('imagenUrl')!.valueChanges.subscribe(() => this.syncPreview()));
    this.subs.add(
      this.form.get('imagenBase64')!.valueChanges.subscribe(() => this.syncPreview())
    );

    // 5) stock disabled en new
    if (this.mode === 'new') {
      this.form.get('stock')?.setValue(0, { emitEvent: false });
      this.form.get('stock')?.disable({ emitEvent: false });
    } else {
      this.form.get('stock')?.enable({ emitEvent: false });
    }

    // 6) ✅ cargar categorías reales desde backend y llenar categoriasUI
    await this.cargarCategoriasReales();

    // 7) si el producto trae una categoría que no existe en DB, la agregamos a la lista
    const cur = (this.form.get('categoria')?.value ?? '').toString();
    if (cur && !this.categoriasUI.some((c) => c.slug === cur)) {
      this.categoriasUI = this.mergeCats(this.categoriasUI, [{ slug: cur, label: cur }]);
    }

    // 8) si el control tiene algo inválido, lo corregimos
    const now = (this.form.get('categoria')?.value ?? '').toString();
    if (!this.categoriasUI.some((c) => c.slug === now)) {
      this.form.get('categoria')?.setValue(this.categoriasUI[0]?.slug ?? 'medicamento', {
        emitEvent: false,
      });
    }

    // 9) si por cualquier razón quedó "medicamentos", lo normalizamos a "medicamento"
    const after = (this.form.get('categoria')?.value ?? '').toString();
    if (after === 'medicamentos') {
      this.form.get('categoria')?.setValue('medicamento', { emitEvent: false });
    }

    // DEBUG opcional
    console.log('[CATS] cargadas =>', this.categoriasUI.length, this.categoriasUI);
    console.log('[CATS] form.categoria =>', this.form.get('categoria')?.value);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  // ✅ para que el chip muestre LABEL (no slug)
  get categoriaLabelActual(): string {
    const slug = (this.form?.get('categoria')?.value ?? '').toString();
    const found = this.categoriasUI?.find((c) => c.slug === slug);
    return found?.label ?? slug ?? '';
  }

  /* =========================
     ✅ Cargar categorías reales
  ========================= */
  private async cargarCategoriasReales() {
    try {
      const cats = await firstValueFrom(this.api.getCategorias());

      const mapped: CategoriaUI[] = (Array.isArray(cats) ? cats : [])
        .map((c: any) => {
          let slug = this.slugify(c?.slug ?? c?.nombre ?? c?.label ?? '');
          // ✅ compat: medicamentos -> medicamento
          if (slug === 'medicamentos') slug = 'medicamento';

          const label = (c?.label ?? c?.nombre ?? c?.slug ?? '').toString().trim();
          return { id: c?.id, slug, label: label || slug };
        })
        .filter((x) => !!x.slug);

      // merge: defaults + backend + input
      this.categoriasUI = this.mergeCats(
        [
          { slug: 'medicamento', label: 'Medicamentos' },
          { slug: 'cremas', label: 'Cremas' },
          { slug: 'perfumes', label: 'Perfumes' },
        ],
        [...mapped, ...(Array.isArray(this.categorias) ? this.categorias : [])]
      );

      // si estás en new y no hay categoría elegida, setea una
      if (this.mode === 'new') {
        const current = (this.form.get('categoria')?.value ?? '').toString().trim();
        if (!current && this.categoriasUI.length) {
          this.form.get('categoria')?.setValue(this.categoriasUI[0].slug, { emitEvent: false });
        }
      }
    } catch (err) {
      console.error('[MODAL] ERROR /categorias', err);
      // nos quedamos con fallback (defaults)
      this.categoriasUI = this.mergeCats(
        [
          { slug: 'medicamento', label: 'Medicamentos' },
          { slug: 'cremas', label: 'Cremas' },
          { slug: 'perfumes', label: 'Perfumes' },
        ],
        Array.isArray(this.categorias) ? this.categorias : []
      );
    }
  }

  /* =========================
     ✅ ion-select change debug
  ========================= */
  onCategoriaChange(ev: any) {
    const v = ev?.detail?.value;
    console.log('[SELECT] ionChange =>', v);
    console.log('[SELECT] form.categoria =>', this.form.get('categoria')?.value);
    console.log('[SELECT] categoriasUI =>', this.categoriasUI.length, this.categoriasUI);

    // ✅ si llega "medicamentos" por cualquier razón, lo normalizamos
    const current = (this.form.get('categoria')?.value ?? '').toString();
    if (current === 'medicamentos') {
      this.form.get('categoria')?.setValue('medicamento', { emitEvent: false });
    }
  }

  /* =========================
     Utils
  ========================= */
  private slugify(input: string): string {
    return (input ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // merge + dedup por slug
  private mergeCats(base: CategoriaUI[], extra: CategoriaUI[]): CategoriaUI[] {
    const map = new Map<string, CategoriaUI>();

    const push = (c: any) => {
      let slug = this.slugify(c?.slug ?? '');
      // ✅ compat: medicamentos -> medicamento
      if (slug === 'medicamentos') slug = 'medicamento';

      const label = (c?.label ?? c?.nombre ?? c?.slug ?? '').toString().trim();
      if (!slug) return;

      if (!map.has(slug)) {
        map.set(slug, { id: c?.id, slug, label: label || slug });
      } else {
        const prev = map.get(slug)!;
        map.set(slug, {
          ...prev,
          id: prev.id ?? c?.id,
          label: label && label.length > 1 ? label : prev.label,
        });
      }
    };

    (Array.isArray(base) ? base : []).forEach(push);
    (Array.isArray(extra) ? extra : []).forEach(push);

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  private enforcePromoRules() {
    const promo = !!this.form.get('promoActiva')?.value;
    const ctrl = this.form.get('precioPromo');
    if (!ctrl) return;

    if (promo) {
      ctrl.setValidators([Validators.required, Validators.min(0)]);
    } else {
      ctrl.clearValidators();
      ctrl.setValue(0, { emitEvent: false });
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  public syncPreview() {
    const url = (this.form?.get('imagenUrl')?.value ?? '').toString().trim();
    const b64 = (this.form?.get('imagenBase64')?.value ?? '').toString().trim();
    this.imgPreview = b64 || url || 'assets/placeholder.png';
  }

  quitarArchivo() {
    this.form.get('imagenBase64')?.setValue('');
    this.syncPreview();
  }

  close() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  /* =========================
     Nueva categoría
  ========================= */
  async addCategoria() {
    const alert = await this.alertCtrl.create({
      header: 'Nueva categoría',
      inputs: [{ name: 'nombre', placeholder: 'Ej: Vitaminas' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Crear',
          handler: async (v) => {
            const nombre = (v?.nombre ?? '').toString().trim();
            if (nombre.length < 2) {
              this.toast('Nombre inválido');
              return false;
            }

            try {
              const created: any = await firstValueFrom(this.api.createCategoria({ nombre }));
              let slug =
                this.slugify(created?.slug ?? created?.nombre ?? nombre) || this.slugify(nombre);

              // ✅ compat: medicamentos -> medicamento
              if (slug === 'medicamentos') slug = 'medicamento';

              const label = (created?.label ?? created?.nombre ?? nombre).toString().trim();

              this.categoriasUI = this.mergeCats(this.categoriasUI, [
                { id: created?.id, slug, label },
              ]);
              this.form.get('categoria')?.setValue(slug);

              this.toast('Categoría creada');
              return true;
            } catch (e) {
              console.error('[MODAL] createCategoria error', e);
              // fallback local
              let slug = this.slugify(nombre);
              if (slug === 'medicamentos') slug = 'medicamento';

              this.categoriasUI = this.mergeCats(this.categoriasUI, [{ slug, label: nombre }]);
              this.form.get('categoria')?.setValue(slug);
              this.toast('Categoría creada (local)');
              return true;
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /* =========================
     File to base64
  ========================= */
  async onFilePicked(ev: any) {
    const file: File | undefined = ev?.target?.files?.[0];
    if (!file) return;

    if (file.size > 3_500_000) {
      this.toast('Imagen muy pesada (máx ~3.5MB)');
      return;
    }

    try {
      const base64 = await this.fileToBase64(file);
      this.form.get('imagenBase64')?.setValue(base64);
      this.form.get('imagenUrl')?.setValue('');
      this.syncPreview();
    } catch {
      this.toast('No se pudo leer la imagen');
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read error'));
      reader.readAsDataURL(file);
    });
  }

  /* =========================
     ✅ Guardar
  ========================= */
  async guardar() {
    if (this.form.invalid) {
      this.toast('Completa los campos obligatorios');
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    const raw = this.form.getRawValue();

    const nombre = (raw.nombre ?? '').toString().trim();
    const marca = (raw.marca ?? '').toString().trim();

    // ✅ categoría canónica
    let categoriaSlug = this.slugify(raw.categoria);
    if (categoriaSlug === 'medicamentos') categoriaSlug = 'medicamento';

    const precioNormal = Number(raw.precioNormal ?? 0);
    const promoActiva = !!raw.promoActiva;
    const precioPromo = promoActiva ? Number(raw.precioPromo ?? 0) : 0;

    const imagenUrl = (raw.imagenUrl ?? '').toString().trim();
    const imagenBase64 = (raw.imagenBase64 ?? '').toString().trim();

    // ✅ STOCK SIEMPRE SE MANDA (en new va 0)
    const stockSafe = this.mode === 'edit' ? Number(raw.stock ?? 0) : 0;

    // ✅ payload compatible con backend viejo y nuevo
    const payload: any = {
      nombre,
      marca,
      categoria: categoriaSlug,

      stock: stockSafe,

      precioNormal,
      precio: precioNormal,

      promoActiva,
      promo_activa: promoActiva,

      precioPromo,
      precio_promo: precioPromo,

      imagenUrl,
      imagen_url: imagenUrl,

      imagenBase64,
      imagen_base64: imagenBase64,
    };

    console.log('[CREATE/UPDATE] payload =>', payload);

    try {
      if (this.mode === 'new') {
        const created = await firstValueFrom(this.api.createProducto(payload));
        this.saving = false;
        this.modalCtrl.dismiss({ action: 'created', producto: created }, 'ok');
        return;
      }

      const id = Number(this.producto?.id);
      if (!Number.isFinite(id)) {
        this.saving = false;
        this.toast('Producto sin id');
        return;
      }

      const updated = await firstValueFrom(this.api.updateProducto(id, payload));
      this.saving = false;
      this.modalCtrl.dismiss({ action: 'updated', producto: updated }, 'ok');
    } catch (e) {
      console.error('[MODAL] guardar error', e);
      this.saving = false;
      this.toast(this.mode === 'new' ? 'No se pudo crear' : 'No se pudo guardar');
    }
  }

  private async toast(message: string) {
    const t = await this.toastCtrl.create({
      message,
      duration: 1400,
      position: 'bottom',
    });
    await t.present();
  }
}
