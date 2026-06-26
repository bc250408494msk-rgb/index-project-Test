<?php
/**
 * Plugin Name: IndexMeNow
 * Plugin URI:  https://github.com/indexmenow
 * Description: Auto-submit WordPress posts and pages to the IndexMeNow indexing tool for faster Google indexing.
 * Version:     1.0.0
 * Author:      IndexMeNow
 * License:     GPL-2.0+
 */

if (!defined('ABSPATH')) exit;

define('INDEXMENOW_VERSION', '1.0.0');
define('INDEXMENOW_PLUGIN_DIR', plugin_dir_path(__FILE__));

require_once INDEXMENOW_PLUGIN_DIR . 'includes/api-client.php';
require_once INDEXMENOW_PLUGIN_DIR . 'admin/settings-page.php';

class IndexMeNow_Plugin {
    private static ?self $instance = null;
    private IndexMeNow_API_Client $client;

    public static function get_instance(): self {
        if (!self::$instance) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        $this->client = new IndexMeNow_API_Client();
        $this->init_hooks();
    }

    private function init_hooks(): void {
        // Admin menu
        add_action('admin_menu', [IndexMeNow_Settings_Page::class, 'register']);

        // AJAX: test connection
        add_action('wp_ajax_indexmenow_test_connection', [$this, 'ajax_test_connection']);

        // Post publish hook
        add_action('transition_post_status', [$this, 'on_post_status_change'], 10, 3);

        // Meta box
        if (get_option('indexmenow_show_meta_box', '1') === '1') {
            add_action('add_meta_boxes', [$this, 'add_meta_box']);
            add_action('save_post', [$this, 'meta_box_save'], 10, 2);
        }

        // Dashboard widget
        add_action('wp_dashboard_setup', [$this, 'add_dashboard_widget']);
    }

    public function on_post_status_change(string $new_status, string $old_status, \WP_Post $post): void {
        $allowed_types = (array) get_option('indexmenow_post_types', ['post', 'page']);
        if (!in_array($post->post_type, $allowed_types)) return;
        if ($post->post_status !== 'publish') return;
        if (wp_is_post_revision($post->ID) || wp_is_post_autosave($post->ID)) return;

        $is_new_publish = $new_status === 'publish' && $old_status !== 'publish';
        $is_update = $new_status === 'publish' && $old_status === 'publish';

        $should_submit = (
            ($is_new_publish && get_option('indexmenow_auto_submit_publish', '1') === '1') ||
            ($is_update && get_option('indexmenow_auto_submit_update', '0') === '1')
        );

        if (!$should_submit) return;

        $url = get_permalink($post->ID);
        if (!$url) return;

        $project_id = get_option('indexmenow_project_id') ?: null;
        $result = $this->client->submit_url($url, $project_id);

        // Store result in post meta
        update_post_meta($post->ID, '_indexmenow_last_submit', [
            'submitted_at' => current_time('mysql'),
            'result'       => $result,
        ]);

        if (!$result['success']) {
            error_log('[IndexMeNow] Failed to submit ' . $url . ': ' . ($result['error'] ?? json_encode($result)));
        }
    }

    public function add_meta_box(): void {
        $post_types = (array) get_option('indexmenow_post_types', ['post', 'page']);
        foreach ($post_types as $type) {
            add_meta_box('indexmenow-meta-box', 'IndexMeNow', [$this, 'render_meta_box'], $type, 'side', 'default');
        }
    }

    public function render_meta_box(\WP_Post $post): void {
        $last = get_post_meta($post->ID, '_indexmenow_last_submit', true);
        $url = get_permalink($post->ID);

        // Check health if URL exists
        $health = [];
        if ($url && $post->post_status === 'publish') {
            $cached = get_transient('indexmenow_health_' . $post->ID);
            if (!$cached) {
                $health = $this->client->health_check($url);
                set_transient('indexmenow_health_' . $post->ID, $health, HOUR_IN_SECONDS);
            } else {
                $health = $cached;
            }
        }
        ?>
        <div style="font-size:13px;">
            <?php if ($last): ?>
                <p><strong>Last submitted:</strong> <?php echo esc_html($last['submitted_at']); ?></p>
                <p><strong>Status:</strong> <?php echo $last['result']['success'] ? '✅ Submitted' : '❌ Failed'; ?></p>
            <?php endif; ?>

            <?php if (!empty($health)): ?>
                <p><strong>Health:</strong>
                    <?php if ($health['isIndexable'] ?? false): ?>
                        <span style="color:green;">✅ Indexable</span>
                    <?php else: ?>
                        <span style="color:red;">❌ Issues found</span>
                        <ul style="margin:4px 0 0 16px; color:#c00;">
                            <?php foreach (($health['failReasons'] ?? []) as $r): ?>
                                <li><?php echo esc_html($r); ?></li>
                            <?php endforeach; ?>
                        </ul>
                    <?php endif; ?>
                </p>
            <?php endif; ?>

            <?php wp_nonce_field('indexmenow_meta_box', 'indexmenow_nonce'); ?>
            <input type="submit" name="indexmenow_manual_submit" class="button button-primary" value="Submit for Indexing" style="margin-top:8px; width:100%;" />
        </div>
        <?php
    }

    public function meta_box_save(int $post_id, \WP_Post $post): void {
        if (!isset($_POST['indexmenow_nonce']) || !wp_verify_nonce($_POST['indexmenow_nonce'], 'indexmenow_meta_box')) return;
        if (!isset($_POST['indexmenow_manual_submit'])) return;
        if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) return;

        $url = get_permalink($post_id);
        if (!$url) return;

        $project_id = get_option('indexmenow_project_id') ?: null;
        $result = $this->client->submit_url($url, $project_id);
        update_post_meta($post_id, '_indexmenow_last_submit', ['submitted_at' => current_time('mysql'), 'result' => $result]);
    }

    public function add_dashboard_widget(): void {
        wp_add_dashboard_widget('indexmenow_widget', 'IndexMeNow Status', [$this, 'render_dashboard_widget']);
    }

    public function render_dashboard_widget(): void {
        $balance = get_transient('indexmenow_balance');
        if (!$balance) {
            $balance = $this->client->get_balance();
            set_transient('indexmenow_balance', $balance, 5 * MINUTE_IN_SECONDS);
        }
        $credits = $balance['credits'] ?? 'N/A';
        $color = is_numeric($credits) ? ($credits > 20 ? 'green' : ($credits >= 5 ? 'orange' : 'red')) : 'gray';
        ?>
        <div style="display:flex; align-items:center; gap:16px;">
            <div>
                <strong>Credits:</strong>
                <span style="font-size:20px; font-weight:bold; color:<?php echo $color; ?>;"><?php echo esc_html($credits); ?></span>
            </div>
            <a href="<?php echo admin_url('options-general.php?page=indexmenow-settings'); ?>" class="button">Settings</a>
        </div>
        <?php
    }

    public function ajax_test_connection(): void {
        check_ajax_referer('', '', false);
        $balance = $this->client->get_balance();
        wp_send_json([
            'success' => isset($balance['credits']),
            'credits' => $balance['credits'] ?? null,
            'error'   => isset($balance['credits']) ? null : 'Could not connect to IndexMeNow',
        ]);
    }
}

// Init plugin
add_action('plugins_loaded', [IndexMeNow_Plugin::class, 'get_instance']);
