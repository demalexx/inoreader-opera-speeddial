// Seconds
var ON_FOCUS_MIN_REFRESH_INTERVAL = 60;

// How often refresh data, seconds
var REFRESH_INTERVAL = 5 * 60;

var is_loading = false;
var last_update = new Date();
var update_timeout = null;

window.addEventListener('load', on_load, false);
opera.extension.tabs.addEventListener('focus', on_tab_focus, false);

function on_load() {
    try_update_data(true);
}

function on_tab_focus() {
    if (get_seconds_since_last_update() < ON_FOCUS_MIN_REFRESH_INTERVAL) {
        return;
    }

    var selected_tab = opera.extension.tabs.getSelected();
    if (selected_tab.url != 'opera:speeddial') {
        return;
    }

    if (is_loading) {
        return;
    }

    try_update_data();
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

function switch_mode(mode) {
    // Reformat content depending on given mode:
    // d - disabled, e.g. when InoReader is unavailable, or user is not logged-in;
    // e - empty, InoReader is available, but user has no unread items;
    // i - items, there are items to show.
    var title = document.querySelector('#inoreader-title');
    var center_logo = document.querySelector('#inoreader-center-logo');
    var center_logo_img = center_logo.querySelector('img');
    var content = document.querySelector('#content');

    if (mode == 'd' || mode == 'e') {
        title.style.display = 'none';
        content.style.display = 'none';
        center_logo.style.display = 'block';

        if (mode == 'd') {
            center_logo_img.setAttribute('src', 'icons/inoreader-logo-bw.png');
        }
        else {
            center_logo_img.setAttribute('src', 'icons/inoreader-logo.png');
        }

        opera.contexts.speeddial.title = 'InoReader';
    }
    else {
        center_logo.style.display = 'none';
        title.style.display = 'block';
        content.style.display = 'block';
    }
}

function update_data(force_update) {
    // Get data from InoReader and refresh SpeedDial content

    if (!force_update && !is_any_speeddial_focused()) {
        return;
    }

    is_loading = true;
    enable_loading_animation(is_loading);
    last_update = new Date();

    var xhr = new XMLHttpRequest();
    xhr.timeout = 15000;
    xhr.addEventListener('readystatechange', readystatecallback, false);
    xhr.open('GET', 'https://www.inoreader.com/api/browser_extensions.php?subscriptions', true);
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

            // "error: not logged-in" case
            if (resp_json['error']) {
                switch_mode('d');
                return;
            }

            // Remove folders, leave only subscriptions, and remove empty subscriptions
            var subscriptions = [];
            for (var i = 0; i < resp_json.length; i++) {
                if (resp_json[i]['type'] == 'subscription' && parseInt(resp_json[i]['unread_cnt']) > 0) {
                    subscriptions.push(resp_json[i]);
                }
            }

            // Sort subscriptions by number of unread items
            subscriptions.sort(function(a, b) {
                return parseInt(b['unread_cnt']) - parseInt(a['unread_cnt']);
            });

            var out = [];
            var unread_total = 0;
            for (i = 0; i < subscriptions.length; i++) {
                out.push(subscriptions[i]);
                unread_total += parseInt(subscriptions[i]['unread_cnt']);
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
                out_html +=     '<img id="' + icon_id + '" class="feed-icon" src="/icons/feed-icon.png" />';
                out_html +=     '<span>' + html_encode(out[i]['title']) + '</span>';
                out_html +=     '<div class="unread-count">' + out[i]['unread_cnt'] + '</div>';
                out_html += '</li>';

                preload_feed_icons[out[i]['id']] = out[i]['icon'];
            }
            out_html += '</ul>';

            var output = document.querySelector('#content');
            output.innerHTML = out_html;
            switch_mode('i');

            opera.contexts.speeddial.title = 'InoReader (' + unread_total + ')';

            // Load feeds icons and update default icon only after feed icon is
            // loaded (to avoid empty rectangle with "img" text)
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

function get_seconds_since_last_update() {
    return (new Date() - last_update) / 1000;
}

function is_any_speeddial_focused() {
    // Return true if there is at least 1 selected speeddial tab
    var tabs = opera.extension.tabs.getAll();

    for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].selected && tabs[i].url == 'opera:speeddial') {
            return true;
        }
    }

    return false;
}

function enable_loading_animation(enabled) {
    document.querySelector('#loading').style.display = (enabled ? 'block' : 'none');
}

function html_encode(text) {
    // Seems new version of API encodes html entities itself - no need to encode
    // it twice
    return text;
//    var div = document.createElement('div');
//    var text_node = document.createTextNode(text);
//    div.appendChild(text_node);
//    return div.innerHTML;
}

function get_feed_icon_id(id) {
    return 'feed-' + id + '-icon';
}

function feed_icon_load() {
    // Set image only if it's loaded successfully, otherwise keep default feed
    // icon
    if (this.complete) {
        var feed_icon = document.querySelector('#' + get_feed_icon_id(this.getAttribute('data-feed-id')));
        feed_icon.setAttribute('src', this.getAttribute('src'));
    }
}