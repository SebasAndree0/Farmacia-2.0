import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { IngresadoGuard } from './Guardias/ingresado.guard';
import { NoIngresadoGuard } from './Guardias/no-ingresado.guard';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./Paginas/login/login.module').then(m => m.LoginPageModule),
    canActivate: [NoIngresadoGuard],
  },
  {
    path: 'registro',
    loadChildren: () => import('./Paginas/registro/registro.module').then(m => m.RegistroPageModule),
  },
  {
    path: '',
    loadChildren: () => import('./Paginas/inicio/inicio.module').then(m => m.InicioPageModule),
  },

  // ✅ PRODUCTO (lista / page normal)
  {
    path: 'producto',
    loadChildren: () => import('./Paginas/producto/producto.module').then(m => m.ProductoPageModule),
  },

  // ✅ PRODUCTO DETALLE por ID (para que "Ver" navegue al producto)
  // Ej: /producto/15
  {
    path: 'producto/:idProducto',
    loadChildren: () => import('./Paginas/producto/producto.module').then(m => m.ProductoPageModule),
  },

  {
    path: 'detalle-producto/:idProducto',
    loadChildren: () =>
      import('./Paginas/detalle-producto/detalle-producto.module').then(m => m.DetalleProductoPageModule),
  },
  {
    path: 'eliminar-producto',
    loadChildren: () =>
      import('./Paginas/eliminar-producto/eliminar-producto.module').then(m => m.EliminarProductoPageModule),
  },
  {
    path: 'modificar-producto',
    loadChildren: () =>
      import('./Paginas/modificar-producto/modificar-producto.module').then(m => m.ModificarProductoPageModule),
  },
  {
    path: 'medio-pago',
    loadChildren: () => import('./Paginas/medio-pago/medio-pago.module').then(m => m.MedioPagoPageModule),
  },
  {
    path: 'carrito/:idUsuario',
    loadChildren: () => import('./Paginas/carrito/carrito.module').then(m => m.CarritoPageModule),
  },
  {
    path: 'medicamentos',
    loadChildren: () => import('./Paginas/medicamentos/medicamentos.module').then(m => m.MedicamentosPageModule),
  },
  {
    path: 'cremas',
    loadChildren: () => import('./Paginas/cremas/cremas.module').then(m => m.CremasPageModule),
  },
  {
    path: 'perfumes',
    loadChildren: () => import('./Paginas/perfumes/perfumes.module').then(m => m.PerfumesPageModule),
  },
  {
    path: 'roles',
    loadChildren: () => import('./Paginas/roles/roles.module').then(m => m.RolesPageModule),
    canActivate: [IngresadoGuard],
  },
  {
    path: 'modificarUsuario/:idUsuario',
    loadChildren: () =>
      import('./Paginas/modificar-usuario/modificar-usuario.module').then(m => m.ModificarUsuarioPageModule),
  },
  {
    path: 'eliminarUsuario/:idUsuario',
    loadChildren: () =>
      import('./Paginas/eliminar-usuario/eliminar-usuario.module').then(m => m.EliminarUsuarioPageModule),
  },
  {
    path: 'producto-qf',
    loadChildren: () => import('./Paginas/producto-qf/producto-qf.module').then(m => m.ProductoQfPageModule),
    canActivate: [IngresadoGuard],
  },
  {
    path: 'cremas-qf',
    loadChildren: () => import('./Paginas/cremas-qf/cremas-qf.module').then(m => m.CremasQfPageModule),
    canActivate: [IngresadoGuard],
  },
  {
    path: 'medicamentos-qf',
    loadChildren: () => import('./Paginas/medicamentos-qf/medicamentos-qf.module').then(m => m.MedicamentosQfPageModule),
    canActivate: [IngresadoGuard],
  },
  {
    path: 'perfumes-qf',
    loadChildren: () => import('./Paginas/perfumes-qf/perfumes-qf.module').then(m => m.PerfumesQfPageModule),
    canActivate: [IngresadoGuard],
  },
  {
    path: 'e404',
    loadChildren: () => import('./Paginas/e404/e404.module').then(m => m.E404PageModule),
  },
  {
    path: 'detalle-cremas/:idProducto',
    loadChildren: () => import('./Paginas/detalle-cremas/detalle-cremas.module').then(m => m.DetalleCremasPageModule),
  },
  {
    path: 'detalle-perfumes/:idProducto',
    loadChildren: () =>
      import('./Paginas/detalle-perfumes/detalle-perfumes.module').then(m => m.DetallePerfumesPageModule),
  },

  // (Opcional) fallback
  // { path: '**', redirectTo: 'e404' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
