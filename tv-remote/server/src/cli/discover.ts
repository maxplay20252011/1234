/**
 * Herramienta de diagnostico principal:  npm run discover
 *
 * Imprime las interfaces de red, todo lo que se encuentra y, con --raw, el
 * trafico crudo de cada protocolo. Cuando un televisor "no aparece", la salida
 * de este comando es el primer lugar donde mirar.
 */
import { loadConfig } from '../config.js';
import { listLanInterfaces, primaryLanAddress } from '../net/interfaces.js';
import { runDiscovery } from '../discovery/service.js';
import { brandLabel } from '../discovery/identify.js';
import { BRAND_PORTS } from '../discovery/probe.js';

const args = new Set(process.argv.slice(2));
const mostrarCrudo = args.has('--raw');
const barrer = args.has('--sweep');

if (args.has('--help') || args.has('-h')) {
  console.log(`
  npm run discover  [-- opciones]

    --raw     Muestra el trafico crudo de SSDP, mDNS y los sondeos.
    --sweep   Ademas del descubrimiento normal, sondea las 254 direcciones de
              tu subred. Sirve cuando el televisor no contesta a multicast
              (router con aislamiento de clientes, VLANs, algunos mesh).
              Tarda mas.
    --help    Esto.
`);
  process.exit(0);
}

// Colores ANSI. Se desactivan solos si la salida no es una terminal, para que
// redirigir la salida a un archivo no la llene de codigos de escape.
const ESC = String.fromCharCode(27);
const usarColor = process.stdout.isTTY === true && process.env['NO_COLOR'] === undefined;
const c = (code: string, text: string): string =>
  usarColor ? `${ESC}[${code}m${text}${ESC}[0m` : text;
const bold = (t: string): string => c('1', t);
const dim = (t: string): string => c('2', t);
const green = (t: string): string => c('32', t);
const yellow = (t: string): string => c('33', t);
const cyan = (t: string): string => c('36', t);

async function main(): Promise<void> {
  const config = loadConfig();

  console.log(bold('\n  Interfaces de red detectadas'));
  const interfaces = listLanInterfaces();
  if (interfaces.length === 0) {
    console.log(yellow('  No hay ninguna interfaz de red local activa.'));
    console.log('  Verifica que la maquina este conectada al WiFi o por cable.\n');
    process.exit(1);
  }
  const principalIp = primaryLanAddress();
  for (const i of interfaces) {
    const marca = i.address === principalIp ? green(' <- principal') : '';
    console.log(`  ${cyan(i.name.padEnd(16))} ${i.address.padEnd(16)} ${dim(i.cidr)}${marca}`);
  }
  if (interfaces.length > 1) {
    console.log(
      dim(
        '\n  Hay mas de una interfaz. El escaneo sale por todas, asi que una VPN\n' +
          '  o Docker activos no deberian tapar el descubrimiento.',
      ),
    );
  }

  const extraHosts: string[] = [];
  if (barrer) {
    const principal = interfaces.find((i) => i.address === principalIp) ?? interfaces[0];
    if (principal) {
      const base = principal.address.split('.').slice(0, 3).join('.');
      for (let i = 1; i <= 254; i++) extraHosts.push(`${base}.${i}`);
      console.log(dim(`\n  Barrido activado: se van a sondear ${base}.1 a ${base}.254`));
    }
  }

  console.log(bold('\n  Escaneando...') + dim(` (SSDP y mDNS, ${config.SSDP_TIMEOUT_MS} ms)\n`));

  const result = await runDiscovery({
    ssdpTimeoutMs: config.SSDP_TIMEOUT_MS,
    probeTimeoutMs: config.PROBE_TIMEOUT_MS,
    extraHosts,
  });

  console.log(bold(`  Dispositivos encontrados: ${result.devices.length}\n`));

  if (result.devices.length === 0) {
    console.log(yellow('  No se encontro nada. Cosas para revisar, en orden:\n'));
    console.log('   1. El televisor tiene que estar ENCENDIDO. En reposo profundo');
    console.log('      muchos modelos no contestan a nada.');
    console.log('   2. Servidor y televisor tienen que estar en la MISMA red. Ojo con');
    console.log('      las redes de invitados y con las bandas separadas 2.4 / 5 GHz.');
    console.log('   3. Si el router tiene "aislamiento de clientes" o "AP isolation"');
    console.log('      activado, el multicast no pasa. Desactivalo o usa --sweep.');
    console.log('   4. Proba:  npm run discover -- --sweep --raw\n');
  }

  for (const d of result.devices) {
    const estado = d.online ? green('online') : dim('offline');
    console.log(`  ${bold(d.name)}  ${estado}`);
    console.log(`    Marca      ${brandLabel(d.brand)}`);
    if (d.model) console.log(`    Modelo     ${d.model}`);
    console.log(`    IP         ${d.ip}`);
    console.log(`    MAC        ${d.mac ?? yellow('desconocida (sin MAC no hay Wake-on-LAN)')}`);
    console.log(`    Id         ${d.id}${d.unstableId ? yellow('  <- inestable') : ''}`);
    console.log(`    Detectado  ${d.sources.join(', ')}`);

    const puertos = (d.raw?.['openPorts'] as number[] | undefined) ?? [];
    if (puertos.length > 0) {
      console.log(`    Puertos    ${puertos.map((p) => `${p}${etiquetaPuerto(p)}`).join(', ')}`);
    }

    const samsung = d.raw?.['samsung'] as Record<string, unknown> | undefined;
    if (samsung) {
      console.log(dim(`    Samsung    modelo interno ${String(samsung['model'] ?? '?')}`));
      const anio = samsung['modelYear'];
      if (anio !== undefined) {
        const conToken = samsung['tokenAuthSupport'] === true;
        console.log(
          dim(
            `               anio ${String(anio)} -> ${
              conToken ? 'wss por el 8002 con token y pop-up' : 'ws por el 8001, sin token'
            }`,
          ),
        );
      }
    }

    const roku = d.raw?.['roku'] as Record<string, unknown> | undefined;
    if (roku) {
      const esTv = roku['isTv'] === true;
      console.log(
        dim(
          `    Roku       ${esTv ? 'es un Roku TV (tiene volumen)' : 'es un stick o box (SIN volumen)'}`,
        ),
      );
    }

    if (d.unstableId) {
      console.log(
        yellow(
          '    Aviso: no se pudo obtener un identificador estable. Si le cambia la\n' +
            '           IP, este dispositivo puede aparecer duplicado.',
        ),
      );
    }
    console.log();
  }

  if (mostrarCrudo) {
    console.log(bold('  -- Trafico crudo -----------------------------------------\n'));
    console.log(bold('  SSDP:'));
    for (const r of result.rawSsdp) {
      console.log(`    ${r.address}  ST=${r.st ?? '-'}`);
      console.log(dim(`      USN=${r.usn ?? '-'}`));
      console.log(dim(`      SERVER=${r.server ?? '-'}`));
      console.log(dim(`      LOCATION=${r.location ?? '-'}`));
    }
    console.log(bold('\n  mDNS:'));
    for (const s of result.rawMdns) {
      console.log(`    ${s.addresses.join(', ')}  _${s.type}._tcp  ${s.name}:${s.port}`);
      console.log(dim(`      TXT ${JSON.stringify(s.txt)}`));
    }
    console.log(bold('\n  Sondeos con al menos un puerto abierto:'));
    for (const p of result.rawProbes.filter((x) => x.openPorts.length > 0)) {
      console.log(`    ${p.ip}  puertos ${p.openPorts.join(', ')}`);
      if (p.samsung) console.log(dim(`      samsung ${JSON.stringify(p.samsung)}`));
      if (p.roku) console.log(dim(`      roku ${JSON.stringify(p.roku)}`));
    }
    console.log();
  } else {
    console.log(dim('  Para ver el trafico crudo:  npm run discover -- --raw\n'));
  }
}

function etiquetaPuerto(port: number): string {
  for (const [marca, puertos] of Object.entries(BRAND_PORTS)) {
    if ((puertos as readonly number[]).includes(port)) return dim(`(${marca})`);
  }
  return '';
}

main().catch((err: unknown) => {
  console.error('\n  El descubrimiento fallo:\n');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
