<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Authentication subrequest endpoint used by Nginx auth_request.
 *
 * This endpoint never proxies WebApp data. It checks the current Moodle
 * session and returns only an HTTP status code.
 *
 * @package   local_mcqwebapp
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);
define('NO_DEBUG_DISPLAY', true);

require_once(__DIR__ . '/../../config.php');

header('Cache-Control: private, no-store, max-age=0');
header('Pragma: no-cache');
header('Vary: Cookie');

$status = 403;
if (!isloggedin() || isguestuser()) {
    $status = 401;
} elseif (\local_mcqwebapp\access::current_user_is_authorised()) {
    $status = 204;
}

\core\session\manager::write_close();
http_response_code($status);
exit;
