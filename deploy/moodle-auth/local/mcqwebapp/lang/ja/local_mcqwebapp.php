<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Japanese strings for the MCQ WebApp access plugin.
 *
 * @package   local_mcqwebapp
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['courseid'] = 'WorkshopコースID';
$string['courseid_desc'] = 'このコースで問題を追加できるユーザーだけがWebAppを開けます。'
    . 'コースIDは、たとえば /course/view.php?id=12 の12です。';
$string['enabled'] = 'Moodleアクセス制御を有効にする';
$string['enabled_desc'] = '設定したコースに起動リンクを表示し、'
    . '条件を満たすMoodleセッションをNginxが認証できるようにします。';
$string['navlabel'] = 'STACK MCQ XML生成';
$string['notconfigured'] = 'MCQ WebAppのコースIDまたはURLが設定されていません。';
$string['notenabled'] = 'MCQ WebAppへのMoodleアクセスが無効です。';
$string['pluginname'] = 'MCQ WebAppアクセス';
$string['privacy:metadata'] = 'MCQ WebAppアクセスプラグインは個人データを保存しません。';
$string['toolurl'] = 'WebApp URL';
$string['toolurl_desc'] = 'Nginxで保護する外部向けHTTPS URLです。'
    . '例: https://moodle.example.org/mcq-webapp/ のように末尾の / を付けてください。';
