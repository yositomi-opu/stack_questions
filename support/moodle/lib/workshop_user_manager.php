<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace stack_questions\moodle_support;

/**
 * Create and manage anonymous workshop accounts.
 *
 * @package   stack_questions
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class workshop_user_manager {
    /** @var \stdClass Workshop course. */
    private \stdClass $course;

    /** @var \context_course Course context. */
    private \context_course $context;

    /** @var \stdClass Enabled manual enrolment instance. */
    private \stdClass $enrolinstance;

    /** @var \enrol_plugin Manual enrolment plugin. */
    private \enrol_plugin $enrolplugin;

    /** @var \stdClass Role assigned to workshop accounts. */
    private \stdClass $role;

    /** @var string Lowercase username prefix. */
    private string $prefix;

    /**
     * Set up and validate the Moodle objects used by all actions.
     *
     * @param int $courseid workshop course id
     * @param string $prefix lowercase username prefix
     * @param string $roleshortname course role shortname
     */
    public function __construct(int $courseid, string $prefix, string $roleshortname) {
        global $DB;

        $this->validate_prefix($prefix);
        $this->prefix = $prefix;

        if ($courseid <= 0 || $courseid === SITEID) {
            throw new \coding_exception('A normal Moodle course ID is required.');
        }
        $this->course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
        $this->context = \context_course::instance($courseid, MUST_EXIST);

        if (!is_enabled_auth('manual')) {
            throw new \coding_exception('The Moodle manual authentication plugin is not enabled.');
        }
        $this->role = $DB->get_record('role', ['shortname' => $roleshortname], '*', MUST_EXIST);
        if (!$DB->record_exists('role_context_levels', [
            'roleid' => $this->role->id,
            'contextlevel' => CONTEXT_COURSE,
        ])) {
            throw new \coding_exception("Role '{$roleshortname}' cannot be assigned in a course context.");
        }

        foreach (enrol_get_instances($courseid, true) as $instance) {
            if ($instance->enrol === 'manual') {
                $this->enrolinstance = $instance;
                break;
            }
        }
        if (!isset($this->enrolinstance)) {
            throw new \coding_exception('An enabled manual enrolment instance is required in the workshop course.');
        }
        $plugin = enrol_get_plugin('manual');
        if ($plugin === null) {
            throw new \coding_exception('The Moodle manual enrolment plugin is unavailable.');
        }
        $this->enrolplugin = $plugin;
    }

    /**
     * Workshop course record.
     *
     * @return \stdClass
     */
    public function course(): \stdClass {
        return $this->course;
    }

    /**
     * Role record.
     *
     * @return \stdClass
     */
    public function role(): \stdClass {
        return $this->role;
    }

    /**
     * Prepare credentials and fail before mutation if any identifier exists.
     *
     * @param int $start first numeric suffix
     * @param int $end last numeric suffix
     * @param int $activeend suffixes up to this value start active
     * @param int $passwordlength requested minimum password length
     * @param string $lang Moodle language code
     * @return array<int, array<string, mixed>>
     */
    public function prepare_new_accounts(
        int $start,
        int $end,
        int $activeend,
        int $passwordlength,
        string $lang
    ): array {
        global $CFG, $DB;

        $this->validate_range($start, $end);
        if ($activeend < 0 || $activeend > $end) {
            throw new \coding_exception('The active-end value must be between 0 and the range end.');
        }
        if ($passwordlength < 12 || $passwordlength > 128) {
            throw new \coding_exception('Password length must be between 12 and 128.');
        }
        if ($lang !== clean_param($lang, PARAM_LANG)) {
            throw new \coding_exception('The language code is invalid.');
        }

        $accounts = [];
        $usedpasswords = [];
        for ($number = $start; $number <= $end; $number++) {
            $identity = $this->identity($number);
            if ($DB->record_exists('user', [
                'username' => $identity['username'],
                'mnethostid' => $CFG->mnet_localhost_id,
            ])) {
                throw new \coding_exception("Username already exists: {$identity['username']}");
            }
            if ($DB->record_exists('user', ['idnumber' => $identity['idnumber']])) {
                throw new \coding_exception("ID number already exists: {$identity['idnumber']}");
            }
            if ($DB->record_exists('user', ['email' => $identity['email']])) {
                throw new \coding_exception("Email address already exists: {$identity['email']}");
            }

            $active = $number <= $activeend;
            $user = (object)[
                'auth' => 'manual',
                'confirmed' => 1,
                'mnethostid' => $CFG->mnet_localhost_id,
                'username' => $identity['username'],
                'idnumber' => $identity['idnumber'],
                'firstname' => 'Workshop',
                'lastname' => sprintf('Participant %03d', $number),
                'email' => $identity['email'],
                'emailstop' => 1,
                'maildisplay' => 0,
                'autosubscribe' => 0,
                'lang' => $lang,
                'suspended' => $active ? 0 : 1,
            ];
            do {
                $password = $this->generate_password($passwordlength, $user);
            } while (isset($usedpasswords[$password]));
            $usedpasswords[$password] = true;
            $accounts[] = [
                'number' => $number,
                'username' => $identity['username'],
                'idnumber' => $identity['idnumber'],
                'password' => $password,
                'active' => $active,
                'user' => $user,
            ];
        }
        return $accounts;
    }

    /**
     * Create prepared accounts and enrol them in one delegated transaction.
     *
     * @param array<int, array<string, mixed>> $accounts prepared accounts
     */
    public function create_accounts(array $accounts): void {
        global $DB;

        $transaction = $DB->start_delegated_transaction();
        try {
            foreach ($accounts as $account) {
                $user = clone $account['user'];
                $user->password = $account['password'];
                $userid = user_create_user($user, true, true);
                $status = $account['active'] ? ENROL_USER_ACTIVE : ENROL_USER_SUSPENDED;
                $this->enrolplugin->enrol_user(
                    $this->enrolinstance,
                    $userid,
                    $this->role->id,
                    0,
                    0,
                    $status,
                    false
                );
            }
            $transaction->allow_commit();
        } catch (\Throwable $error) {
            $transaction->rollback($error);
        }
    }

    /**
     * Activate or suspend a complete range after validating every account.
     *
     * @param int $start first numeric suffix
     * @param int $end last numeric suffix
     * @param bool $active true to activate; false to suspend
     */
    public function set_range_state(int $start, int $end, bool $active): void {
        global $DB;

        $users = $this->managed_users($start, $end);
        $transaction = $DB->start_delegated_transaction();
        try {
            foreach ($users as $user) {
                user_update_user((object)[
                    'id' => $user->id,
                    'suspended' => $active ? 0 : 1,
                ], false, true);

                if ($active) {
                    $this->enrolplugin->enrol_user(
                        $this->enrolinstance,
                        $user->id,
                        $this->role->id,
                        0,
                        0,
                        ENROL_USER_ACTIVE,
                        false
                    );
                } else {
                    $this->enrolplugin->update_user_enrol(
                        $this->enrolinstance,
                        $user->id,
                        ENROL_USER_SUSPENDED
                    );
                }
            }
            $transaction->allow_commit();
        } catch (\Throwable $error) {
            $transaction->rollback($error);
        }
    }

    /**
     * Return site account, course enrolment and teacher-role state for a range.
     *
     * @param int $start first numeric suffix
     * @param int $end last numeric suffix
     * @return array<int, array<string, mixed>>
     */
    public function range_status(int $start, int $end): array {
        global $CFG, $DB;

        $this->validate_range($start, $end);
        $rows = [];
        for ($number = $start; $number <= $end; $number++) {
            $identity = $this->identity($number);
            $user = $DB->get_record('user', [
                'username' => $identity['username'],
                'mnethostid' => $CFG->mnet_localhost_id,
                'deleted' => 0,
            ]);
            if (!$user || $user->idnumber !== $identity['idnumber']) {
                $rows[] = [
                    'number' => $number,
                    'username' => $identity['username'],
                    'account' => 'missing',
                    'course' => 'missing',
                    'teacher' => 'no',
                ];
                continue;
            }

            $userenrolment = $DB->get_record('user_enrolments', [
                'enrolid' => $this->enrolinstance->id,
                'userid' => $user->id,
            ]);
            $hasrole = $DB->record_exists('role_assignments', [
                'roleid' => $this->role->id,
                'contextid' => $this->context->id,
                'userid' => $user->id,
            ]);
            $rows[] = [
                'number' => $number,
                'username' => $identity['username'],
                'account' => $user->suspended ? 'suspended' : 'active',
                'course' => $userenrolment
                    ? ($userenrolment->status == ENROL_USER_ACTIVE ? 'active' : 'suspended')
                    : 'missing',
                'teacher' => $hasrole ? 'yes' : 'no',
            ];
        }
        return $rows;
    }

    /**
     * Load and validate all managed users before changing any of them.
     *
     * @param int $start first numeric suffix
     * @param int $end last numeric suffix
     * @return array<int, \stdClass>
     */
    private function managed_users(int $start, int $end): array {
        global $CFG, $DB;

        $this->validate_range($start, $end);
        $users = [];
        for ($number = $start; $number <= $end; $number++) {
            $identity = $this->identity($number);
            $user = $DB->get_record('user', [
                'username' => $identity['username'],
                'mnethostid' => $CFG->mnet_localhost_id,
                'deleted' => 0,
            ]);
            if (!$user || $user->idnumber !== $identity['idnumber']) {
                throw new \coding_exception("Managed workshop account is missing: {$identity['username']}");
            }
            $users[] = $user;
        }
        return $users;
    }

    /**
     * Construct the identifiers for one numeric suffix.
     *
     * @param int $number numeric suffix
     * @return array<string, string>
     */
    private function identity(int $number): array {
        $username = $this->prefix . str_pad((string)$number, 3, '0', STR_PAD_LEFT);
        return [
            'username' => $username,
            'idnumber' => strtoupper($username),
            'email' => $username . '@workshop.invalid',
        ];
    }

    /**
     * Generate a cryptographically secure password accepted by Moodle policy.
     *
     * @param int $requestedlength requested minimum length
     * @param \stdClass $user user fields used by password policy
     * @return string
     */
    private function generate_password(int $requestedlength, \stdClass $user): string {
        global $CFG;

        $groups = [
            ['abcdefghjkmnpqrstuvwxyz', max(1, (int)($CFG->minpasswordlower ?? 0))],
            ['ABCDEFGHJKMNPQRSTUVWXYZ', max(1, (int)($CFG->minpasswordupper ?? 0))],
            ['23456789', max(1, (int)($CFG->minpassworddigits ?? 0))],
            ['!#%+?@', max(1, (int)($CFG->minpasswordnonalphanum ?? 0))],
        ];
        $minimumlength = max($requestedlength, (int)($CFG->minpasswordlength ?? 0));
        $minimumlength = max($minimumlength, array_sum(array_column($groups, 1)));
        if ($minimumlength > 128) {
            throw new \coding_exception('The configured Moodle password policy requires more than 128 characters.');
        }
        $allcharacters = implode('', array_column($groups, 0));
        $lasterror = '';

        for ($attempt = 0; $attempt < 200; $attempt++) {
            $characters = [];
            foreach ($groups as [$alphabet, $minimum]) {
                for ($index = 0; $index < $minimum; $index++) {
                    $characters[] = $this->random_character($alphabet);
                }
            }
            while (count($characters) < $minimumlength) {
                $characters[] = $this->random_character($allcharacters);
            }
            for ($index = count($characters) - 1; $index > 0; $index--) {
                $swap = random_int(0, $index);
                [$characters[$index], $characters[$swap]] = [$characters[$swap], $characters[$index]];
            }
            $password = implode('', $characters);
            if (check_password_policy($password, $lasterror, $user)) {
                return $password;
            }
        }
        throw new \coding_exception('Could not generate a password accepted by Moodle policy: ' . $lasterror);
    }

    /**
     * Return one random ASCII character.
     *
     * @param string $alphabet allowed characters
     * @return string
     */
    private function random_character(string $alphabet): string {
        return $alphabet[random_int(0, strlen($alphabet) - 1)];
    }

    /**
     * Validate the username prefix.
     *
     * @param string $prefix username prefix
     */
    private function validate_prefix(string $prefix): void {
        if (!preg_match('/^[a-z][a-z0-9_-]*$/', $prefix)) {
            throw new \coding_exception('Username prefix must be lowercase ASCII and start with a letter.');
        }
        if (strlen($prefix) > 90) {
            throw new \coding_exception('Username prefix is too long.');
        }
    }

    /**
     * Validate a three-digit numeric suffix range.
     *
     * @param int $start first suffix
     * @param int $end last suffix
     */
    private function validate_range(int $start, int $end): void {
        if ($start < 1 || $end < $start || $end > 999) {
            throw new \coding_exception('Range must satisfy 1 <= start <= end <= 999.');
        }
    }
}
