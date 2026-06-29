<?php
if (!defined('ABSPATH')) exit;

class IndexMeNow_Settings_Page {
    public static function register(): void {
        add_options_page(
            'IndexMeNow Settings',
            'IndexMeNow',
            'manage_options',
            'indexmenow-settings',
            [self::class, 'render']
        );
    }

    public static function render(): void {
        if (!current_user_can('manage_options')) return;

        if (isset($_POST['indexmenow_save']) && check_admin_referer('indexmenow_settings')) {
            update_option('indexmenow_api_url', sanitize_url($_POST['api_url'] ?? ''));
            update_option('indexmenow_api_key', sanitize_text_field($_POST['api_key'] ?? ''));
            update_option('indexmenow_auto_submit_publish', isset($_POST['auto_submit_publish']) ? '1' : '0');
            update_option('indexmenow_auto_submit_update', isset($_POST['auto_submit_update']) ? '1' : '0');
            update_option('indexmenow_post_types', array_map('sanitize_text_field', $_POST['post_types'] ?? ['post', 'page']));
            update_option('indexmenow_show_meta_box', isset($_POST['show_meta_box']) ? '1' : '0');
            update_option('indexmenow_project_id', sanitize_text_field($_POST['project_id'] ?? ''));
            echo '<div class="notice notice-success"><p>Settings saved.</p></div>';
        }

        $api_url = get_option('indexmenow_api_url', '');
        $api_key = get_option('indexmenow_api_key', '');
        $auto_publish = get_option('indexmenow_auto_submit_publish', '1');
        $auto_update = get_option('indexmenow_auto_submit_update', '0');
        $post_types = get_option('indexmenow_post_types', ['post', 'page']);
        $show_meta_box = get_option('indexmenow_show_meta_box', '1');
        $project_id = get_option('indexmenow_project_id', '');

        $all_post_types = get_post_types(['public' => true], 'objects');
        ?>
        <div class="wrap">
            <h1>IndexMeNow Settings</h1>
            <form method="post">
                <?php wp_nonce_field('indexmenow_settings'); ?>
                <table class="form-table">
                    <tr>
                        <th>API URL</th>
                        <td>
                            <input type="url" name="api_url" value="<?php echo esc_attr($api_url); ?>" class="regular-text" placeholder="https://your-indexmenow-domain.com" />
                            <p class="description">Your IndexMeNow server URL.</p>
                        </td>
                    </tr>
                    <tr>
                        <th>API Key</th>
                        <td>
                            <input type="password" name="api_key" value="<?php echo esc_attr($api_key); ?>" class="regular-text" placeholder="imn_..." />
                            <?php if ($api_key): ?>
                                <button type="button" class="button" onclick="indexmenow_test_connection()">Test Connection</button>
                                <span id="indexmenow-test-result"></span>
                            <?php endif; ?>
                            <p class="description" style="color:#8a6d3b; background:#fcf8e3; border:1px solid #faebcc; padding:6px 8px; border-radius:3px; margin-top:6px;">
                                <strong>Security notice:</strong> This API key is stored in plaintext in the WordPress <code>wp_options</code> database table.
                                Any WordPress administrator can read it via the database or <code>get_option()</code>.
                                Rotate the key immediately if an admin account is compromised.
                                Use a dedicated read-only API key for this plugin rather than a shared credential.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th>Project ID (optional)</th>
                        <td>
                            <input type="text" name="project_id" value="<?php echo esc_attr($project_id); ?>" class="regular-text" placeholder="UUID of your project" />
                        </td>
                    </tr>
                    <tr>
                        <th>Auto-submit on Publish</th>
                        <td><input type="checkbox" name="auto_submit_publish" <?php checked($auto_publish, '1'); ?> /> Submit new posts/pages automatically when published</td>
                    </tr>
                    <tr>
                        <th>Auto-submit on Update</th>
                        <td><input type="checkbox" name="auto_submit_update" <?php checked($auto_update, '1'); ?> /> Re-submit when a post/page is updated</td>
                    </tr>
                    <tr>
                        <th>Post Types</th>
                        <td>
                            <?php foreach ($all_post_types as $type): ?>
                                <label style="display:block; margin-bottom:4px;">
                                    <input type="checkbox" name="post_types[]" value="<?php echo esc_attr($type->name); ?>" <?php echo in_array($type->name, (array)$post_types) ? 'checked' : ''; ?> />
                                    <?php echo esc_html($type->label); ?>
                                </label>
                            <?php endforeach; ?>
                        </td>
                    </tr>
                    <tr>
                        <th>Show Meta Box in Editor</th>
                        <td><input type="checkbox" name="show_meta_box" <?php checked($show_meta_box, '1'); ?> /> Show IndexMeNow meta box in post/page editor</td>
                    </tr>
                </table>
                <p class="submit">
                    <input type="submit" name="indexmenow_save" class="button-primary" value="Save Settings" />
                </p>
            </form>
        </div>

        <script>
        function indexmenow_test_connection() {
            var el = document.getElementById('indexmenow-test-result');
            el.textContent = ' Testing...';
            fetch('<?php echo admin_url('admin-ajax.php'); ?>', {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: 'action=indexmenow_test_connection'
            })
            .then(r => r.json())
            .then(d => { el.textContent = d.success ? ' ✅ Connected! Balance: ' + d.credits + ' credits' : ' ❌ ' + (d.error || 'Failed'); });
        }
        </script>
        <?php
    }
}
