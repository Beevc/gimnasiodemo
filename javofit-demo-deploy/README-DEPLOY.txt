====================================================================
 JAVOFIT — DEMO DE VENTA · Instrucciones de deploy (Vercel)
====================================================================

QUÉ ES ESTA CARPETA
-------------------
Una demo autocontenida del dashboard, con DATOS FICTICIOS en memoria
(sin Supabase, sin login, sin base de datos real). Sirve para mostrar
a compradores: pueden tocar todo (crear/editar/borrar, pagos, medidas,
PRs, asistencia...) y al RECARGAR o con el botón "Reiniciar demo"
vuelve al estado inicial.

La raíz del sitio (index.html) abre la demo directo.

Contenido:
  index.html          -> la demo (entra directo, sin login)
  js/demo-data.js      -> datos de ejemplo (18 clientes inventados)
  js/api-demo.js       -> "Api" simulado en memoria (reemplaza a Supabase)
  js/app.js            -> la app (idéntica al original, sin cambios)
  img/                 -> logos

IMPORTANTE (seguridad): esta carpeta NO incluye config.js, api.js,
supabaseClient.js, schema.sql ni migraciones a propósito, para no
exponer tu Supabase real. NO agregues esos archivos acá.


--------------------------------------------------------------------
OPCION A — SUBIR CON EL CLI DE VERCEL (lo más rápido)
--------------------------------------------------------------------
1) Instalar el CLI (una sola vez en tu PC):
      npm i -g vercel

2) Iniciar sesión con TU cuenta de demos (una sola vez):
      vercel login

3) Parado DENTRO de esta carpeta, publicar:
      vercel --prod

   La primera vez te pregunta el nombre del proyecto (ej: javofit-demo).
   Te devuelve el link, ej: https://javofit-demo.vercel.app

PARA ACTUALIZAR la demo más adelante:
   entrás a esta carpeta y volvés a correr:
      vercel --prod

PARA BAJAR el link:
      vercel remove javofit-demo
   (o desde el panel de Vercel: proyecto -> Settings -> Delete Project)


--------------------------------------------------------------------
OPCION B — GITHUB + PANEL DE VERCEL (para tener muchas demos)
--------------------------------------------------------------------
1) Crear un repo NUEVO y PRIVADO en GitHub (uno por demo).
2) Subir el contenido de esta carpeta a ese repo.
3) En vercel.com -> "Add New... -> Project" -> importar el repo.
   Framework Preset: "Other" (es un sitio estático, sin build).
4) Cada push al repo actualiza la demo solo.

Para bajar el link: en el panel de Vercel, Delete Project.


--------------------------------------------------------------------
REUSAR ESTE PAQUETE PARA OTRA DEMO / OTRO GIMNASIO
--------------------------------------------------------------------
- Los datos de ejemplo están en js/demo-data.js (clientes, planes,
  staff). Editá ahí para cambiar nombres, precios, etc.
- La marca (logo) está en img/ y el nombre en index.html.
- Deploy como cliente nuevo -> otro proyecto de Vercel -> otro link.


--------------------------------------------------------------------
PROBAR LOCALMENTE (opcional, sin subir nada)
--------------------------------------------------------------------
- Doble clic en index.html abre la demo en tu navegador.
- Si algo no carga por el modo archivo, levantá un server simple:
      python -m http.server 8080
  y abrí http://localhost:8080/
====================================================================
