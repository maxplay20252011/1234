# ICON Outfit Scan · validación

## Intérprete de tarjetas (`node pruebas/lector.test.cjs`)
```
52/52 casos bien
```

## Navegador (`pruebas/e2e.cjs`, Chromium, 1366×900 y 390×844)

Fotos de prueba: cada tarjeta impresa; una foto con las tres tarjetas giradas, desenfocadas y con menos luz (leída en ~0,8 s); una tarjeta sin QR; un video falso de cámara con la tarjeta "Cita o salida especial".
```
ok   escritorio: foto de tarjeta de estilo → Elegante
ok   escritorio: dice qué falta
ok   escritorio: clima y evento leídos
ok   escritorio: indica que se leyó por QR
ok   escritorio: avisa que están las tres
ok   escritorio: repetir tarjeta no cambia nada
ok   escritorio: genera el mismo look que la versión manual (A)
ok   escritorio: "Probar otra combinación" conserva lo escaneado
ok   escritorio: combinación B escaneada → Plan al Sol
ok   escritorio: "Volver al inicio" borra lo escaneado
ok   escritorio: sin scroll horizontal (1366px)
ok   escritorio: sin errores de consola 
ok   celular: foto de tarjeta de estilo → Elegante
ok   celular: dice qué falta
ok   celular: clima y evento leídos
ok   celular: indica que se leyó por QR
ok   celular: avisa que están las tres
ok   celular: repetir tarjeta no cambia nada
ok   celular: genera el mismo look que la versión manual (A)
ok   celular: "Probar otra combinación" conserva lo escaneado
ok   celular: combinación B escaneada → Plan al Sol
ok   celular: "Volver al inicio" borra lo escaneado
ok   celular: sin scroll horizontal (390px)
ok   celular: sin errores de consola 
ok   foto con tres tarjetas juntas → las tres leídas de una vez
ok   tarjeta sin QR (sin Claude disponible) → mensaje claro
ok   elegir a mano también carga la tarjeta
ok   sin permiso de cámara → ofrece la foto
ok   sin errores de consola 
ok   cámara en vivo lee el QR de la tarjeta
ok   la cámara se apaga
```

No probado acá: la lectura de texto con Claude (necesita el visor de claude.ai) ni un celular real.
