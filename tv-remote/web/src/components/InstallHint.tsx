import { useEffect, useState } from 'react';

const CLAVE_DESCARTADO = 'tv-remote:install-hint-descartado';

/**
 * Aviso de "agregar a pantalla de inicio" para iPhone y iPad.
 *
 * iOS nunca ofrece instalar por su cuenta: no existe el evento
 * beforeinstallprompt de Chrome, asi que si no se le dice al usuario que entre
 * por el menu Compartir, no se entera de que se puede.
 *
 * Solo aparece en iOS, solo fuera del modo pantalla completa, y una vez
 * descartado no vuelve.
 */
export function InstallHint(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let descartado = false;
    try {
      descartado = localStorage.getItem(CLAVE_DESCARTADO) === '1';
    } catch {
      // Navegacion privada o almacenamiento bloqueado: se muestra igual.
    }
    if (descartado) return;

    const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    // `standalone` es propio de Safari en iOS y no esta en los tipos estandar.
    const yaInstalada =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    setVisible(esIos && !yaInstalada);
  }, []);

  if (!visible) return null;

  const descartar = (): void => {
    setVisible(false);
    try {
      localStorage.setItem(CLAVE_DESCARTADO, '1');
    } catch {
      // Si no se puede guardar, vuelve a aparecer la proxima vez. No es grave.
    }
  };

  return (
    <div className="mb-4 rounded-2xl bg-sky-500/10 px-4 py-3 ring-1 ring-sky-500/25">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-sky-100">
          Podes dejarlo como una app en la pantalla de inicio: tocá{' '}
          <span className="font-semibold">Compartir</span> abajo en Safari y despues{' '}
          <span className="font-semibold">Agregar a pantalla de inicio</span>.
        </p>
        <button
          onClick={descartar}
          aria-label="Cerrar aviso"
          className="-m-1 shrink-0 rounded-lg p-1 text-sky-300/70 active:bg-sky-500/20"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
