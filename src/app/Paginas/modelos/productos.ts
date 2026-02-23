export interface Producto {
  categoria: string;
  marca: string;
  nombre: string;
  imagen: string;
  precio: number;
  detalle: string;
  receta: string;
  cantidad: number;
  stock: number;

  // ✅ opcionales promo
  precioPromo?: number;  // camelCase
  precio_promo?: number; // snake_case
}

export interface ProductoId extends Producto {
  id: number;
}

export interface ProductoParcial extends Partial<Producto> {}
