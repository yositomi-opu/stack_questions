<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_mcqwebapp;

/**
 * Shared access checks for the launcher and the Nginx authentication endpoint.
 *
 * @package   local_mcqwebapp
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class access {
    /**
     * Whether access through this plugin has been enabled by an administrator.
     *
     * @return bool
     */
    public static function is_enabled(): bool {
        return (bool)get_config('local_mcqwebapp', 'enabled');
    }

    /**
     * Configured workshop course id.
     *
     * @return int
     */
    public static function course_id(): int {
        return (int)get_config('local_mcqwebapp', 'courseid');
    }

    /**
     * Return the configured course, or null when it is missing.
     *
     * @return \stdClass|null
     */
    public static function course(): ?\stdClass {
        global $DB;

        $courseid = self::course_id();
        if ($courseid <= 0) {
            return null;
        }
        $course = $DB->get_record('course', ['id' => $courseid]);
        return $course ?: null;
    }

    /**
     * Return the configured WebApp URL when it is an absolute HTTP(S) URL.
     *
     * @return string
     */
    public static function tool_url(): string {
        $url = trim((string)get_config('local_mcqwebapp', 'toolurl'));
        if ($url === '') {
            return '';
        }
        $parts = parse_url($url);
        if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
            return '';
        }
        if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            return '';
        }
        return $url;
    }

    /**
     * Check the current Moodle session and question-authoring capability.
     *
     * @return bool
     */
    public static function current_user_is_authorised(): bool {
        if (!self::is_enabled() || !isloggedin() || isguestuser()) {
            return false;
        }
        $course = self::course();
        if ($course === null || self::tool_url() === '') {
            return false;
        }
        $context = \context_course::instance($course->id);
        return has_capability('moodle/question:add', $context);
    }
}
