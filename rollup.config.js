// rollup.config.js
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import postcss from 'rollup-plugin-postcss';
import copy from 'rollup-plugin-copy';

// Función para inyectar shaders, movida desde Gulp
const injectShadersPlugin = () => {
  return {
    name: 'inject-shaders',
    async buildStart() {
      const shaders = [
        'src/materials/shaders/pointcloud.vs',
        'src/materials/shaders/pointcloud.fs',
        'src/materials/shaders/pointcloud_sm.vs',
        'src/materials/shaders/pointcloud_sm.fs',
        'src/materials/shaders/normalize.vs',
        'src/materials/shaders/normalize.fs',
        'src/materials/shaders/normalize_and_edl.fs',
        'src/materials/shaders/edl.vs',
        'src/materials/shaders/edl.fs',
        'src/materials/shaders/blur.vs',
        'src/materials/shaders/blur.fs',
      ];

      let components = ['let Shaders = {};'];
      for (const file of shaders) {
        const filename = file.split('/').pop();
        const content = await fs.promises.readFile(file, 'utf8');
        const prep = `Shaders["${filename}"] = \`${content}\``;
        components.push(prep);
      }
      components.push('export {Shaders};');

      const content = components.join('\n\n');
      // Crearemos un archivo temporal que Rollup pueda importar
      // O lo inyectamos directamente en la memoria virtual si Rollup lo permite (más avanzado)
      // Por simplicidad, un archivo temporal es más fácil de depurar.
      // También podrías pre-procesar esto con un script antes de Rollup.
      this.emitFile({
        type: 'asset',
        fileName: 'shaders.js', // Se pondrá en el directorio de salida
        source: content,
      });

      // Ahora, la forma de importar esto es un poco más compleja si lo quieres como un módulo directamente.
      // Una alternativa más simple es que este plugin modifique el AST o que los shaders se lean en runtime
      // en Potree.js (menos eficiente).
      // Por ahora, asumimos que este plugin genera el archivo y Potree lo "conoce".
      // La mejor forma es que src/Potree.js importe './shaders.js' y este plugin lo genere en el lugar correcto.
    },
  };
};

export default [
  {
    input: 'src/Potree.js',
    // Treeshake puede ser true ahora si el código lo permite, reduciendo el tamaño del bundle.
    // Aunque para bibliotecas que exponen muchos módulos, a veces es mejor false.
    treeshake: true, // Intenta con true
    output: {
      file: '../../apps/web/public/potree/potree.js',
      // format: 'esm', // ¡Cambio clave a ESM!
      // No necesitamos 'name' para ESM si no es una librería global.
      format: 'umd', // ¡Cambio clave a ESM!
      name: 'Potree',
      sourcemap: true,
    },
    plugins: [
      nodeResolve(), // Resuelve módulos de node_modules
      commonjs(), // Convierte módulos CommonJS a ESM para Rollup
      postcss({
        // Para importar CSS si Potree.css es importado en JS
        extract: true, // Extrae CSS a un archivo separado
        minimize: true,
      }),
      // Considera cómo integrar los shaders aquí.
      // Una opción es que 'src/Potree.js' importe un archivo `shaders.js`
      // que Gulp (o un script pre-Rollup) generaría.
      // O que el plugin `injectShadersPlugin` genere un archivo temporal.
      // O bien, que Potree cargue los shaders directamente en runtime.
      // Por ahora, lo dejamos como una consideración.
      // injectShadersPlugin(), // Si lo integras directamente en Rollup
      copy({
        targets: [
          { src: 'src/viewer/sidebar.html', dest: '../../apps/web/public/potree' },
          { src: 'src/viewer/profile.html', dest: '../../apps/web/public/potree' },
          { src: 'resources/**/*', dest: '../../apps/web/public/potree/resources' },
          { src: 'libs/**/*', dest: '../../apps/web/public/potree/libs' },
          { src: 'LICENSE', dest: '../../apps/web/public/potree' },
          // Los workers y lazyLibs son más complejos; los manejaremos con Gulp o Rollup por separado.
          // O podrías configurarlos como entradas separadas de Rollup para que también sean ESM.
        ],
      }),
    ],
  },
  // Workers: Mantener como ES Modules, pero quizás agruparlos o usar un patrón diferente.
  // Es bueno que ya sean ES Modules.
  {
    input: 'src/workers/BinaryDecoderWorker.js',
    output: {
      file: '../../apps/web/public/potree/workers/BinaryDecoderWorker.js',
      format: 'es',
      sourcemap: false,
    },
  },
  {
    input: 'src/modules/loader/2.0/DecoderWorker.js',
    output: {
      file: '../../apps/web/public/potree/workers/2.0/DecoderWorker.js',
      format: 'es',
      sourcemap: false,
    },
  },
  {
    input: 'src/modules/loader/2.0/DecoderWorker_brotli.js',
    output: {
      file: '../../apps/web/public/potree/workers/2.0/DecoderWorker_brotli.js',
      format: 'es',
      sourcemap: false,
    },
  },
  // Y los workers de Gulp (LASLAZWorker, etc.) también deberían ser transicionados aquí o manejados de otra forma.
  // Idealmente, todos los JS deberían pasar por Rollup.
];
