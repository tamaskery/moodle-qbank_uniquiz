<?php
// Install real Moodle core language packs in the disposable acceptance site only.
define('CLI_SCRIPT', true);
require(getenv('UNIQUIZ_MOODLE_ROOT') . '/config.php');
require_once($CFG->libdir . '/componentlib.class.php');
\core\session\manager::set_user(get_admin());
$controller = new \tool_langimport\controller();
$controller->install_languagepacks(['es', 'de', 'fr', 'hu']);
purge_all_caches();
$languages = [];
foreach (['es', 'de', 'fr', 'hu'] as $language) {
    if (!get_string_manager()->translation_exists($language)) {
        throw new RuntimeException('Missing core language pack: ' . $language);
    }
    $languages[$language] = get_string_manager()->load_component_strings('qbank_uniquiz', $language);
}
file_put_contents(getenv('UNIQUIZ_QA_RESULTS') . '/ci-language-strings.json', json_encode($languages));
echo "Four official core language packs installed; native plugin strings loaded.\n";
