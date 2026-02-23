import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiProductoService } from '../servicios/api-producto.service';

@Component({
  selector: 'app-medicamentos-qf',
  templateUrl: './medicamentos-qf.page.html',
  styleUrls: ['./medicamentos-qf.page.scss'],
})
export class MedicamentosQfPage implements OnInit {


  public imagenCargando = false;
  public imagenBase64 = '';
  public formulario: FormGroup;
  constructor(

    private formB: FormBuilder,
    private apiProducto: ApiProductoService,
    private router: Router) {



    this.formulario = this.formB.group({

      nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      marca: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      imagen: ['', Validators.required],
      precio: [0, [Validators.required, Validators.min(1)]],
      categoria: ['medicamentos'],
      detalle: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      receta: ['', Validators.required],
      cantidad: [1],
    })
  }

  public campo(control: string) {
    return this.formulario.get(control);
  }
  public fueTocado(control: string){
    return this.formulario.get(control).touched;
  }
  public estaSucio(control: string){
    return this.formulario.get(control).dirty;
  }


  public cargarFoto(e: Event){
    this.imagenCargando = true;
    const elemento = e.target as HTMLInputElement;
    const archivo = elemento.files[0];
    console.log(archivo);
    const reader = new FileReader();
    reader.readAsDataURL(archivo);
    reader.onload = () => {
      this.imagenCargando = false;
      console.log('Carga terminada');
      this.imagenBase64 = reader.result as string;
    }
  }

  public guardarImagen(): void {
    if(this.formulario.invalid || this.imagenCargando){
      this.formulario.markAllAsTouched();
      return;
    }
    this.apiProducto.agregarProducto({
      ...this.formulario.value,
      imagen: this.imagenBase64,


    })
    .subscribe(resultado => {
      if(resultado){
        this.formulario.reset();
        this.formulario.updateValueAndValidity();
        alert('Imagen Guardada');
        this.router.navigate(['/producto-qf']);
      }
    })

  }

  ngOnInit() {
  }






}
