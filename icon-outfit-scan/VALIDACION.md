# ICON Outfit Scan · validación

## Intérprete de tarjetas (`node pruebas/lector.test.cjs`)
```
52/52 casos bien
```

## Banco de 60 fotos difíciles (`pruebas/banco.cjs`)

| Versión | Bien leídas | Tiempo medio |
|---|---|---|
| Anterior (solo jsQR) | 40/60 (67 %) | 4863 ms |
| Actual | 49/60 (82 %) | 4200 ms |

Detalle de la versión actual:
```
Tarjetas cargadas por vía: {"Leída por QR":59,"Leída por el texto":13}
Bien leídas: 49/60 (82 %) · tiempo medio 4200 ms
caso03.jpg tam=0.22 giro=15 persp=0.18 blur=3 luz=1 reflejo=0 ruido=14 → nada (esperado evento:clases) 8385ms — ocr=«xo LOVE PE Y v va US»
caso07.jpg tam=0.55 giro=-30 persp=0.18 blur=5 luz=0.4 reflejo=0.8 ruido=0 → nada (esperado evento:formal) 2702ms — ocr=«Q lt í O a eZ Nu UY»
caso11.jpg tam=0.22 giro=180 persp=0.06 blur=5 luz=0.8 reflejo=0.8 ruido=14 → nada (esperado clima:templado) 6399ms — ocr=«ñ L uu E E u E N E Ta o o E E e e A o e le polaco de pe»
caso26.jpg tam=0.22 giro=15 persp=0 blur=5 luz=1 reflejo=0 ruido=14 → nada (esperado estilo:elegante) 8961ms — ocr=«vo ue XA»
caso41.jpg tam=0.16 giro=-30 persp=0.06 blur=3 luz=0.55 reflejo=0.8 ruido=0 → nada (esperado estilo:urbano) 2207ms — ocr=«aC ko»
caso43.jpg tam=0.16 giro=0 persp=0.12 blur=3 luz=0.4 reflejo=0.5 ruido=14 → nada (esperado estilo:boho) 8838ms — ocr=«xo e o e ro uu u a Nu E E Su a A E E E E Z es a ue E T T E us E»
caso45.jpg tam=0.3 giro=0 persp=0.18 blur=3 luz=0.8 reflejo=0 ruido=14 → nada (esperado estilo:deportivo) 7908ms — ocr=«vo a odU viales worse»
caso48.jpg tam=0.24 giro=0 persp=0.06 blur=5 luz=0.4 reflejo=0 ruido=0 → clima:templado,evento:airelibre (esperado clima:templado,estilo:romantico,evento:airelibre) 2139ms — ocr=«Pasco al aire libre Templado Ne an ICON iCON a LX ICON A»
caso53.jpg tam=0.3 giro=-8 persp=0 blur=0 luz=0.8 reflejo=0 ruido=6 → clima:frio,estilo:romantico (esperado clima:frio,estilo:romantico,evento:cita) 2304ms jsQR + ZXing ocr=«TARJETA ESTILO PERSONAL TARJETA CLIMA TARJETA y TIPO Romántico Frío m E ICON lla 
caso54.jpg tam=0.2 giro=0 persp=0 blur=5 luz=0.8 reflejo=0 ruido=0 → clima:templado,evento:fiesta (esperado clima:templado,estilo:boho,evento:fiesta) 2211ms — ocr=«ea me e Cc Fiesta nocturna ED Templado E»
caso58.jpg tam=0.3 giro=-8 persp=0.06 blur=5 luz=0.8 reflejo=0 ruido=14 → clima:frio (esperado clima:frio,estilo:glam,evento:clases) 9009ms — ocr=«ema s EF Día de elas Frío ICON Clan ICON MÍ Ox»
```

## Navegador (`pruebas/e2e.cjs`, Chromium, 1366×900 y 390×844, servidor con CSP)
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
ok   tarjeta sin QR → se lee el texto impreso, sin internet
ok   elegir a mano también carga (y corrige) la tarjeta
ok   sin permiso de cámara → ofrece la foto
ok   sin errores de consola 
ok   cámara en vivo lee el QR de la tarjeta
ok   la cámara se apaga
```

## Política de seguridad del visor

- Con WebAssembly permitido: lector de texto listo en ~0,4 s.
- Sin WebAssembly: se detecta en ~30 ms, el estado lo muestra y los QR se siguen leyendo.

No probado acá: el visor real de claude.ai (cámara, WebAssembly y Claude) ni un celular real.
