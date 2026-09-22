VENTAS YUPI DILAN — tienda con catálogo y flujo de pedidos

Incluye: Google Login, validación de ID/nombre con proveedor, catálogo, transferencia, comprobante JPG/PNG/PDF, pedidos, Admin con código y confirmación manual antes de llamar al proveedor.

Para hacerla funcionar:
1) Instalar Node.js y ejecutar npm install.
2) Copiar .env.example a .env.
3) Configurar Google OAuth.
4) Crear cuenta/API de FazerCards y configurar FAZER_API_KEY, categoría y ofertas.
5) Configurar los datos de transferencia en .env.
6) Usar HTTPS y un servidor Node.js. Netlify Drop no sirve para esta versión backend.
7) Configurar webhook de FazerCards para estados finales en producción.

La API de FazerCards documenta validate-id (devuelve player_name) y topups/order; las claves deben permanecer en servidor.


Catálogo configurado con los precios solicitados: 5,600+560 $680; 2,180+218 $290; 1,060+106 $150; 572+52 $90; 110 $12; 341 $40; 572 $70; 1,166 $130; 2,398 $250; 6,160 $550; Pase Booyah $35 MXN.
