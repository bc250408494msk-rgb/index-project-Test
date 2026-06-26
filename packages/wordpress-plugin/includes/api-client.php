<?php
if (!defined('ABSPATH')) exit;

class IndexMeNow_API_Client {
    private string $api_url;
    private string $api_key;

    public function __construct() {
        $this->api_url = get_option('indexmenow_api_url', '');
        $this->api_key = get_option('indexmenow_api_key', '');
    }

    public function submit_url(string $url, ?string $project_id = null): array {
        if (empty($this->api_key) || empty($this->api_url)) {
            return ['success' => false, 'error' => 'API key or URL not configured'];
        }

        $body = ['urls' => [$url]];
        if ($project_id) $body['project_id'] = $project_id;

        $response = wp_remote_post(
            trailingslashit($this->api_url) . 'api/v1/submit',
            [
                'method'  => 'POST',
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-KEY'    => $this->api_key,
                ],
                'body'    => wp_json_encode($body),
                'timeout' => 15,
            ]
        );

        if (is_wp_error($response)) {
            // Retry once
            $response = wp_remote_post(
                trailingslashit($this->api_url) . 'api/v1/submit',
                [
                    'method'  => 'POST',
                    'headers' => ['Content-Type' => 'application/json', 'X-API-KEY' => $this->api_key],
                    'body'    => wp_json_encode($body),
                    'timeout' => 15,
                ]
            );

            if (is_wp_error($response)) {
                error_log('[IndexMeNow] API call failed: ' . $response->get_error_message());
                return ['success' => false, 'error' => $response->get_error_message()];
            }
        }

        $code = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);

        return ['success' => $code === 200, 'http_code' => $code, 'data' => $data];
    }

    public function get_balance(): array {
        if (empty($this->api_key) || empty($this->api_url)) {
            return ['credits' => null];
        }

        $response = wp_remote_get(
            trailingslashit($this->api_url) . 'api/v1/balance',
            ['headers' => ['X-API-KEY' => $this->api_key], 'timeout' => 10]
        );

        if (is_wp_error($response)) return ['credits' => null];
        return json_decode(wp_remote_retrieve_body($response), true) ?? ['credits' => null];
    }

    public function health_check(string $url): array {
        if (empty($this->api_key) || empty($this->api_url)) return [];
        $response = wp_remote_post(
            trailingslashit($this->api_url) . 'api/v1/health-check',
            [
                'method'  => 'POST',
                'headers' => ['Content-Type' => 'application/json', 'X-API-KEY' => $this->api_key],
                'body'    => wp_json_encode(['urls' => [$url]]),
                'timeout' => 15,
            ]
        );
        if (is_wp_error($response)) return [];
        $data = json_decode(wp_remote_retrieve_body($response), true);
        return $data[0] ?? [];
    }
}
