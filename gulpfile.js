const path = require('path');
const gulp = require('gulp');
const exec = require('child_process').exec; // <-- ¡Asegúrate de que esta línea esté aquí!

const fs = require('fs');
const fsp = fs.promises;
const concat = require('gulp-concat');
const connect = require('gulp-connect');
const { watch } = gulp;

const { createExamplesPage } = require('./src/tools/create_potree_page');
const { createGithubPage } = require('./src/tools/create_github_page');
const { createIconsPage } = require('./src/tools/create_icons_page');

// Define el array de shaders (si no lo tienes ya)
let shaders = [
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

// LA TAREA DE SHADERS (Asegúrate de que sea así o similar)
gulp.task('shaders', async function () {
  const components = ['let Shaders = {};'];

  for (let file of shaders) {
    const filename = path.basename(file); // Obtiene solo el nombre del archivo (ej: "pointcloud.vs")

    // Lee el contenido del archivo shader
    const content = await fsp.readFile(file, 'utf8'); // Añade 'utf8' para asegurar la codificación

    // Escapa cualquier comilla invertida que pueda haber en el contenido del shader
    // para evitar que rompa el template literal
    const escapedContent = content.replace(/`/g, '\\`');

    // Construye la línea JavaScript para asignar el shader al objeto Shaders
    const prep = `Shaders["${filename}"] = \`${escapedContent}\`;`;

    components.push(prep);
  }

  // Agrega la exportación si es necesario para el build (aunque para este enfoque no es crítico si Potree no lo importa como módulo)
  components.push('export {Shaders};'); // Lo dejamos por si acaso, no hace daño.

  const finalContent = components.join('\n\n'); // Une todas las líneas

  const targetDir = `./build/shaders`; // Directorio temporal para el archivo generado
  const targetPath = `${targetDir}/shaders.js`;

  // Crea el directorio si no existe
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true }); // `recursive: true` crea directorios anidados si no existen
  }
  fs.writeFileSync(targetPath, finalContent, { flag: 'w' }); // Escribe el archivo

  console.log(`Shaders generated at: ${targetPath}`);
});

// Define paths
let paths = {
  html: [
    'src/viewer/potree.css', // Si Rollup no lo maneja
  ],
};

let workers = {
  // Los workers que Rollup no compila, o que necesitan concatenación especial
  LASLAZWorker: [
    'libs/plasio/workers/laz-perf.js',
    'libs/plasio/workers/laz-loader-worker.js',
  ],
  LASDecoderWorker: ['src/workers/LASDecoderWorker.js'],
  EptLaszipDecoderWorker: [
    'libs/copc/index.js',
    'src/workers/EptLaszipDecoderWorker.js',
  ],
  EptBinaryDecoderWorker: [
    'libs/ept/ParseBuffer.js',
    'src/workers/EptBinaryDecoderWorker.js',
  ],
  EptZstandardDecoderWorker: [
    'src/workers/EptZstandardDecoder_preamble.js',
    'libs/zstd-codec/bundle.js',
    'libs/ept/ParseBuffer.js',
    'src/workers/EptZstandardDecoderWorker.js',
  ],
};

let lazyLibs = {
  geopackage: 'libs/geopackage',
  'sql.js': 'libs/sql.js',
};

// Tareas de Gulp para cosas que Rollup no hace o es más fácil con Gulp
gulp.task(
  'webserver',
  gulp.series(async function () {
    server = connect.server({
      port: 1234,
      https: false,
    });
  }),
);

gulp.task('examples_page', async function (done) {
  await Promise.all([createExamplesPage(), createGithubPage()]);
  done();
});

gulp.task('icons_viewer', async function (done) {
  await createIconsPage();
  done();
});

// Los workers que Gulp aún concatena
gulp.task('workers_gulp_concat', async function (done) {
  for (let workerName of Object.keys(workers)) {
    gulp
      .src(workers[workerName])
      .pipe(concat(`${workerName}.js`))
      .pipe(gulp.dest('build/potree/workers'));
  }
  gulp
    .src('./libs/copc/laz-perf.wasm')
    .pipe(gulp.dest('build/potree/workers'));
  done();
});

// Copiar las librerías "lazy"
gulp.task('lazylibs_copy', async function (done) {
  for (let libname of Object.keys(lazyLibs)) {
    const libpath = lazyLibs[libname];
    gulp
      .src([`${libpath}/**/*`])
      .pipe(gulp.dest(`build/potree/lazylibs/${libname}`));
  }
  done();
});

// Copiar todas las librerías manteniendo la estructura
gulp.task('libs_copy', async function (done) {
  gulp
    .src(['libs/**/*'])
    .pipe(gulp.dest('build/potree/libs'));
  done();
});

// Tarea para ejecutar Rollup (ahora como comando)
gulp.task('rollup_build', async function (done) {
  // Ejecuta Rollup como un comando, asumiendo que está en tus scripts de NPM o en PATH
  exec('rollup -c', function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
    if (err) done(err);
    else done();
  });
});

// Tarea principal de construcción
gulp.task(
  'build',
  gulp.series(
    gulp.parallel(
      'workers_gulp_concat',
      'lazylibs_copy',
      'libs_copy',
      'icons_viewer',
      'examples_page',
      'shaders', // Si aún usas la tarea de Gulp para generar shaders.js antes de Rollup
    ),
    'rollup_build', // Rollup se ejecuta DESPUÉS de que Gulp haya preparado todo lo que necesita.
    async function (done) {
      // Tareas de copia que Rollup no hace, o si quieres mantenerlas aquí.
      gulp.src(paths.html).pipe(gulp.dest('build/potree'));
      // `resources` y `LICENSE` ya están copiados por Rollup en la nueva config.
      done();
    },
  ),
);

gulp.task(
  'watch',
  gulp.parallel('build', 'webserver', async function () {
    let watchlist = [
      'src/**/*.js',
      'src/**/**/*.js',
      'src/**/*.css',
      'src/**/*.html',
      'src/**/*.vs',
      'src/**/*.fs',
      'resources/**/*',
      'examples//**/*.json',
      '!resources/icons/index.html',
    ];
    watch(watchlist, gulp.series('build')); // 'pack' ya no es necesario, Rollup es parte de 'build'
  }),
);

// Y ajustar el script "build" en package.json:
// "build": "gulp build"
