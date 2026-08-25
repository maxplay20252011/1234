import type { RunSceneResult, Scene, SceneStep, SceneStepResult } from '@tv-remote/shared';
import type { ControlService } from './control.js';
import { ControlError } from '../adapters/errors.js';
import { logger } from '../logger.js';

/**
 * Ejecuta las escenas paso a paso.
 *
 * Dos decisiones que importan:
 *
 * 1. Los pasos van EN ORDEN y en serie, nunca en paralelo. Una escena como
 *    "encender, esperar 8 segundos, poner HDMI2" no significa nada si los pasos
 *    se pisan.
 *
 * 2. Un paso que falla NO corta la escena. Si el televisor del cuarto no
 *    responde, el del living igual tiene que encenderse. Al final se informa
 *    que salio bien y que no, en vez de dejar todo a medias en silencio.
 */
export class SceneRunner {
  constructor(private readonly control: ControlService) {}

  async run(scene: Scene): Promise<RunSceneResult> {
    const results: SceneStepResult[] = [];
    logger.info({ sceneId: scene.id, pasos: scene.steps.length }, 'Ejecutando escena');

    for (const [index, step] of scene.steps.entries()) {
      try {
        await this.runStep(step);
        results.push({ index, ok: true });
      } catch (err) {
        const mensaje =
          err instanceof ControlError ? err.userMessage : 'No se pudo completar este paso.';
        logger.warn({ sceneId: scene.id, index, err }, 'Un paso de la escena fallo');
        results.push({ index, ok: false, error: mensaje });
      }
    }

    return { sceneId: scene.id, results, ok: results.every((r) => r.ok) };
  }

  private async runStep(step: SceneStep): Promise<void> {
    switch (step.type) {
      case 'wait':
        await new Promise((r) => setTimeout(r, step.seconds * 1000));
        return;
      case 'powerOn':
        await this.control.powerOn(step.deviceId);
        return;
      case 'powerOff':
        await this.control.powerOff(step.deviceId);
        return;
      case 'setVolume':
        await this.control.setVolume(step.deviceId, step.level);
        return;
      case 'setInput':
        await this.control.setInput(step.deviceId, step.inputId);
        return;
      case 'key':
        await this.control.sendKey(step.deviceId, step.key);
        return;
      case 'castUrl':
        await this.control.castUrl(step.deviceId, { url: step.url });
        return;
    }
  }
}

/**
 * Acciones en lote sobre un grupo.
 *
 * Aca si va en paralelo: son aparatos distintos y no hay orden que respetar.
 * Se usa allSettled para que un televisor apagado no impida actuar sobre el resto.
 */
export async function runOnGroup<T>(
  deviceIds: readonly string[],
  accion: (deviceId: string) => Promise<T>,
): Promise<{ deviceId: string; ok: boolean; error?: string }[]> {
  const resultados = await Promise.allSettled(deviceIds.map((id) => accion(id)));
  return resultados.map((r, i) => {
    const deviceId = deviceIds[i] as string;
    if (r.status === 'fulfilled') return { deviceId, ok: true };
    const err: unknown = r.reason;
    return {
      deviceId,
      ok: false,
      error: err instanceof ControlError ? err.userMessage : 'No se pudo completar la acción.',
    };
  });
}
