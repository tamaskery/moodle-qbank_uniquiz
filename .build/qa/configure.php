<?php
// Disposable CI acceptance database only. Never distributed in the plugin archive.
if (getenv('GITHUB_ACTIONS') !== 'true') {
    throw new RuntimeException('This configuration is restricted to disposable GitHub runners.');
}
$file = getenv('UNIQUIZ_MOODLE_ROOT') . '/config.php';
$contents = file_get_contents($file);
$marker = '// Extra config.';
if (substr_count($contents, $marker) !== 1) {
    throw new RuntimeException('Unexpected CI configuration.');
}
$extra = <<<'PHP'
$CFG->wwwroot = 'http://127.0.0.1:18080';
$CFG->prefix = 'uqaccept_';
$CFG->dataroot .= '/uniquiz_acceptance';
if (!is_dir($CFG->dataroot)) {
    mkdir($CFG->dataroot, 0770, true);
}
$CFG->noemailever = true;
$CFG->passwordpolicy = 0;
PHP;
file_put_contents($file, str_replace($marker, $extra . "\n" . $marker, $contents));
