import { Injectable } from '@angular/core';
import { Usuario, UsuarioConIdo, UsuarioParcial } from '../modelos/usuario';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiUsuarioService {

  // ✅ ahora apunta al backend (por env)
  public url_usuario = `${environment.apiUrl}/usuario`;

  public paginaActualUsuario = 1;
  private comLista = new BehaviorSubject<Array<UsuarioConIdo>>([]);

  public listaUsuario$ = this.comLista.asObservable();

  constructor(
    private http: HttpClient
  ) {}

  public agregarUsuario(usuario: Usuario) {
    return this.http.post(this.url_usuario, usuario, {
      headers: {
        'Content-Type': 'application/json;charset=utf-8'
      }
    });
  }

  public getUsuario(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(this.url_usuario);
  }

  public idUsuario(id: any) {
    localStorage.setItem('ID', id);
  }

  public retornarId() {
    return localStorage.getItem('ID');
  }

  public obtenerPrimerosUsuarios() {
    this.http.get<UsuarioConIdo[]>(`${this.url_usuario}?_page=1`).pipe()
      .subscribe(resp => {
        this.paginaActualUsuario = this.paginaActualUsuario + 1;
        this.comLista.next(resp);
      });
  }

  public obtenerUsuarioPorID(id: number): Observable<UsuarioConIdo | null> {
    return this.http.get<UsuarioConIdo | null>(`${this.url_usuario}/${id}`);
  }

  public modificarPorID(id: number, payload: UsuarioParcial): Observable<any> {
    return this.http.patch(`${this.url_usuario}/${id}`, payload, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
  }

  public eliminarUsuarioPorID(id: number): Observable<any> {
    return this.http.delete(`${this.url_usuario}/${id}`);
  }

  public tipoUsuario(id: any) {
    localStorage.setItem('tipo', id);
  }

  public retornarTipo() {
    return localStorage.getItem('tipo');
  }

  public ingresoUsuario(id: any) {
    localStorage.setItem('tipoIngreso', id);
  }

  public retornarIngreso() {
    return localStorage.getItem('tipoIngreso');
  }

  public nombreUsuario(id: any) {
    localStorage.setItem('nombreUsuario', id);
  }

  public retornarUsuario() {
    return localStorage.getItem('nombreUsuario');
  }
}
