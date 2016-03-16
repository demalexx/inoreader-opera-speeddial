// When Speed Dial gets focus refresh data if specified time passed
// since last update, seconds
var ON_FOCUS_MIN_REFRESH_INTERVAL = 1 * 60;

// How often refresh data, seconds
var REFRESH_INTERVAL = 5 * 60;

APP_ID = '1000001123';
APP_KEY = 'glP5_6AR3sfGU3LLYTbC34bZltXzdFYL';

var is_loading = false;
var last_update = new Date();
var update_timeout = null;
var is_any_speed_dial_active = false;
var subscriptions_by_id = {};

window.addEventListener('load', on_load, false);
chrome.tabs.onActivated.addListener(on_tab_updated);
chrome.tabs.onUpdated.addListener(on_tab_updated);

function on_load() {
    try_update_data(true);
}

function on_tab_updated() {
    chrome.tabs.query({'active': true}, function(tabs) {
        is_any_speed_dial_active = false;

        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].url == 'chrome://startpage/') {
                is_any_speed_dial_active = true;
                break;
            }
        }

        if (!is_any_speed_dial_active || is_loading || (get_seconds_since_last_update() < ON_FOCUS_MIN_REFRESH_INTERVAL)) {
            return;
        }

        try_update_data();
    });
}

function try_update_data(force_update) {
    // Try to update data from InoReader and schedule update no matter what
    // happened (exceptions etc).

    // In case when `try_update_data` is called when tab is focused need to clear
    // timeout to avoid possible situation when data is refreshed after focus
    // and immediately is refreshed by timeout
    clearTimeout(update_timeout);
    try {
        update_data(force_update);
    }
    finally {
        update_timeout = setTimeout(try_update_data, REFRESH_INTERVAL * 1000);
    }
}

function update_data(force_update) {
    // Get data from InoReader and refresh SpeedDial content

    // Refresh only if at least 1 Speed Dial opened to avoid abusing InoReader
    // (probably not needed precaution)
    if (!force_update && !is_any_speed_dial_active) {
        return;
    }

    is_loading = true;
    enable_loading_animation(is_loading);
    last_update = new Date();

    // Need to do 2 API requests - first to get subscriptions data with
    // titles and icons, second - to get unread counts with
    // subscriptions ids only. Make one request after another as second
    // depends on data from first.
    load_subscriptions(load_unreads);

    function load_unreads() {
        xhr = new XMLHttpRequest();
        xhr.timeout = 15000;
        xhr.addEventListener('readystatechange', readystatecallback, false);
        xhr.open('GET', 'https://www.inoreader.com/reader/api/0/unread-count', true);
        xhr.setRequestHeader('AppId', APP_ID);
        xhr.setRequestHeader('AppKey', APP_KEY);
        xhr.send();

        function readystatecallback(event) {
            if (xhr.readyState != 4) {
                return;
            }

            try {
                if (xhr.status != 200) {
                    return;
                }

                // Data has been received from InoReader, process it
                var resp_json = JSON.parse(xhr.responseText);

                // Process only subscriptions with some unread items
                var subscriptions = [];
                for (var i = 0; i < resp_json['unreadcounts'].length; i++) {
                    var skip =
                        resp_json['unreadcounts'][i]['id'].indexOf('feed/') != 0 ||
                        parseInt(resp_json['unreadcounts'][i]['count']) == 0;

                    if (skip) {
                        continue;
                    }

                    subscriptions.push(resp_json['unreadcounts'][i]);
                }

                // Sort subscriptions by number of unread items
                subscriptions.sort(function(a, b) {
                    return parseInt(b['count']) - parseInt(a['count']);
                });

                var out = [];
                var unread_total = 0;
                for (i = 0; i < subscriptions.length; i++) {
                    out.push(subscriptions[i]);
                    unread_total += parseInt(subscriptions[i]['count']);
                }

                if (unread_total == 0) {
                    switch_mode('e');
                    return;
                }

                var out_html = '<ul>';
                var preload_feed_icons = {};
                for (i = 0; i < Math.min(out.length, 10); i++) {
                    var icon_id = get_feed_icon_id(out[i]['id']);

                    out_html += '<li>';
                    out_html += '<img id="' + icon_id + '" class="feed-icon" src="/icons/feed-icon.png" />';
                    out_html += '<span>' + html_encode((subscriptions_by_id[out[i]['id']] || {})['title']) + '</span>';
                    out_html += '<div class="unread-count">' + out[i]['count'] + '</div>';
                    out_html += '</li>';

                    preload_feed_icons[out[i]['id']] = subscriptions_by_id[out[i]['id']]['iconUrl'];
                }
                out_html += '</ul>';

                var output = document.querySelector('#content');
                output.innerHTML = out_html;
                switch_mode('i');

                opr.speeddial.update({title: 'InoReader (' + unread_total + ')'});

                // Load feeds icons and update default icon only after
                // feed icon is loaded (to avoid empty rectangle with "img" text)
                for (var id in preload_feed_icons) {
                    if (!preload_feed_icons.hasOwnProperty(id)) {
                        return;
                    }

                    // Create Image object to load icon in background
                    var img = new Image();
                    img.setAttribute('data-feed-id', id);
                    img.addEventListener('load', feed_icon_load, false);
                    img.setAttribute('src', preload_feed_icons[id]);
                }
            }
            finally {
                is_loading = false;
                enable_loading_animation(is_loading);
            }
        }
    }
}

function load_subscriptions(callback) {
    // Load list of subscriptions from API. In any case call `callback`

    var xhr = new XMLHttpRequest();
    xhr.timeout = 15000;
    xhr.addEventListener('readystatechange', readystatecallback, false);
    xhr.open('GET', 'https://www.inoreader.com/reader/api/0/subscription/list', true);
    xhr.setRequestHeader('AppId', APP_ID);
    xhr.setRequestHeader('AppKey', APP_KEY);
    xhr.send();

    function readystatecallback(event) {
        if (xhr.readyState != 4) {
            return;
        }

        try {
            if (xhr.status != 200) {
                return;
            }

            var resp_json = JSON.parse(xhr.responseText);

            subscriptions_by_id = {};
            for (var i = 0; i < resp_json['subscriptions'].length; i++) {
                subscriptions_by_id[resp_json['subscriptions'][i]['id']] = resp_json['subscriptions'][i];
            }
        }
        finally {
            callback();
        }
    }
}

function feed_icon_load() {
    // Set image only if it's loaded successfully, otherwise keep default feed
    // icon
    if (this.complete) {
        var feed_icon = document.querySelector('[id="' + get_feed_icon_id(this.getAttribute('data-feed-id')) + '"]');
        feed_icon.setAttribute('src', this.getAttribute('src'));
    }
}

function switch_mode(mode) {
    // Reformat content depending on given mode:
    // d - disabled, e.g. when InoReader is unavailable, or user is not logged-in;
    // e - empty, InoReader is available, but user has no unread items;
    // i - items, there are items to show.
    var center_logo = document.querySelector('#inoreader-center-logo');
    var center_logo_img = center_logo.querySelector('img');
    var content = document.querySelector('#content');

    if (mode == 'd' || mode == 'e') {
        content.style.display = 'none';
        center_logo.style.display = 'block';

        if (mode == 'd') {
            center_logo_img.setAttribute('src', 'icons/inoreader-logo-bw.png');
        }
        else {
            center_logo_img.setAttribute('src', 'icons/inoreader-logo.png');
        }

        opr.speeddial.update({title: 'InoReader'});
    }
    else {
        center_logo.style.display = 'none';
        content.style.display = 'block';
    }
}

function get_seconds_since_last_update() {
    return (new Date() - last_update) / 1000;
}

function enable_loading_animation(enabled) {
    document.querySelector('#loading').style.display = (enabled ? 'block' : 'none');
}

function html_encode(text) {
    // Seems new version of API encodes html entities itself - no need to encode
    // it twice
    return text;
}

function get_feed_icon_id(id) {
    return 'feed-' + id + '-icon';
}