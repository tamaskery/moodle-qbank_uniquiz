<?php
// CLI-only fixture for disposable local QA sites. Never packaged.
define('CLI_SCRIPT', true);
require(getenv('UNIQUIZ_MOODLE_ROOT') . '/config.php');
$target = $CFG->dataroot . '/lang/en_local/qbank_uniquiz.php';
$marker = '// UNIQUIZ PSEUDOLANGUAGE QA FIXTURE';
if (($argv[1] ?? '') === 'install') {
    if (file_exists($target)) {
        throw new RuntimeException('Refusing to overwrite an existing language customization.');
    }
    $strings = get_string_manager()->load_component_strings('qbank_uniquiz', 'en');
    $output = "<?php\n$marker\n";
    foreach ($strings as $key => $value) {
        $value = '⟦' . $value . '⟧';
        if (in_array($key, ['ui_conversion_progress', 'js_core_no_correct_answer'])) {
            $value .= ' " ><img id="uq-xss" src="x" onerror="window.uqXss=1">';
        }
        $output .= '$string[' . var_export($key, true) . '] = ' . var_export($value, true) . ";\n";
    }
    if (!is_dir(dirname($target))) {
        mkdir(dirname($target), 0755, true);
    }
    file_put_contents($target, $output);
    chmod($target, 0644);
} else if (($argv[1] ?? '') === 'restore') {
    if (!file_exists($target) || !str_contains(file_get_contents($target), $marker)) {
        throw new RuntimeException('Not an installed QA fixture; refusing to remove.');
    }
    unlink($target);
} else {
    throw new RuntimeException('Use install or restore.');
}
purge_all_caches();
echo "Pseudolanguage {$argv[1]} complete.\n";
