window.addEventListener('load', onLoad, false);

function onLoad() {
    tryUpdateData();
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

function tryUpdateData() {
    // Try to update data from InoReader and schedule update no matter what
    // happened (exceptions etc)

    try {
        updateData();
    }
    finally {
        setTimeout(tryUpdateData, 5 * 60 * 1000);
    }
}

function updateData() {
    // Get data from InoReader and refresh SpeedDial content

    function loadCallback(event) {
        // Data has been received from InoReader, process it
        var resp_json = event.target.response;

        // "error: not logged-in" case
        if (resp_json['error']) {
            switch_mode('d');
            return;
        }

        // Remove folders, leave only subscriptions
        var subscriptions = [];
        for (var i = 0; i < resp_json.length; i++) {
            if (resp_json[i]['type'] == 'subscription') {
                subscriptions.push(resp_json[i]);
            }
        }

        // Sort subscriptions by number of unread items
        subscriptions.sort(function(a, b) {
            return b['unread_cnt'] - a['unread_cnt'];
        });

        var out = [];
        var unread_total = 0;
        for (i = 0; i < subscriptions.length; i++) {
            out.push(subscriptions[i]);
            unread_total += subscriptions[i]['unread_cnt'];
        }

        if (unread_total == 0) {
            switch_mode('e');
            return;
        }

        var out_html = '<ul>';
        for (i = 0; i < out.length; i++) {
            out_html += '<li>';
            out_html +=     '<span>';
            out_html +=         '<img class="feed-icon" src="/icons/feed-icon.png" />';
            out_html +=         htmlEncode(out[i]['title']);
            out_html +=     '</span>';
            out_html +=     '<div class="unread-count">' + out[i]['unread_cnt'] + '</div>';
            out_html += '</li>';
        }
        out_html += '</ul>';

        var output = document.querySelector('#content');
        output.innerHTML = out_html;
        switch_mode('i');

        opera.contexts.speeddial.title = 'InoReader (' + unread_total + ')';
    }

    var xhr = new XMLHttpRequest();
    xhr.responseType = 'json';
    xhr.timeout = 15000;
    xhr.addEventListener('load', loadCallback, false);
    xhr.open('GET', 'https://www.inoreader.com/api/browser_extensions.php?subscriptions', true);
    xhr.send();
}

function htmlEncode(text) {
   var div = document.createElement('div');
   var text_node = document.createTextNode(text);
   div.appendChild(text_node);
   return div.innerHTML;
}