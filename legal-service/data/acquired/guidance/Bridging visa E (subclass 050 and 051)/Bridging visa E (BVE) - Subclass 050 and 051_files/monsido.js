(function(window, document) {
    if (window.monsidoTrackingUrl !== undefined) {
      return;
    }

    var loadScript = function(file) {
        try {
            var mon = document.createElement('script');
            mon.type = 'text/javascript';
            mon.async = true;
            mon.src = file;
            var s = document.getElementsByTagName('script')[0];
            s.parentNode.insertBefore(mon, s);
        } catch(err) {
        }
    }

    var loadCss = function(file) {
        try {
            var mon = document.createElement('link');
            mon.href = file;
            mon.rel = "stylesheet";
            var s = document.getElementsByTagName('script')[0];
            s.parentNode.insertBefore(mon, s);
        } catch(err) {
        }
    }

    var addMonsidoImage = function(url) {
        var img = new Image();
        img.src = url;
        img.setAttribute("style", "display:none");
        img.setAttribute("height", 1);
        img.setAttribute("width", 1);
    }

    var  addLoadEvent = function(func) {
        // If document already loaded
        if (document.readyState != "uninitialized" && document.readyState != "loading") {
          return func();
        }

        if (window.attachEvent) {
          window.attachEvent("onload", func);
        } else {
          window.addEventListener("load", func, false);
        }
    }

    var getUname = function() {
        var text = "",
            possible = "ABCDE1234567890";

        for( var i=0; i < 3; i++ )
            text += possible.charAt(Math.floor(Math.random() * possible.length));

        return text + (new Date()).getTime();
    };

    var setCookie = function(cname, cvalue, exdays) {
        var d = new Date();
        d.setTime(d.getTime() + (exdays*24*60*60*1000));
        var expires = "expires="+d.toUTCString();
        document.cookie = cname + "=" + cvalue + "; " + expires +";path=/";
    };

    var getCookie = function(cname) {
        var name = cname + "=";
        var ca = document.cookie.split(';');
        for(var i=0; i<ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1);
            if (c.indexOf(name) == 0) return c.substring(name.length,c.length);
        }
        return "";
    };

    try{
        window.monsidoTrackingUrl = "https://tracking.monsido.com";
        window.monsidoEnv = "production";

        var url = document.URL, idx = url.indexOf("#"),
            hash = window.location.hash;
        if (hash.indexOf("#_monT=") !== -1) {
            var params = hash.split(/=(.+)?/);
            var test;
            if(params[0] === "#_monT"){
                var subParams = params[1].split("~"),
                    pageId = subParams[0].split("~")[0].split("=")[1];

                if(subParams.length >= 2){
                    test = subParams[1].split("~")[0].split("=")[1];
                }

                if(pageId){
                    switch (test){
                        case "1":
                            loadScript("https://cdn.monsido.com/tool/javascripts/monsido_sop_test.js");
                        break;
                        case "2":
                            loadScript("https://cdn.monsido.com/tool/javascripts/monsido_sop_old.js");
                        break;
                        default:
                            loadScript("https://cdn.monsido.com/tool/javascripts/monsido_sop.js");
                        break;
                    }
                }
            }
        } else {
            var token = _monsido[0][1];

            if (_monsido.length >= 2 && _monsido[1][0] == "_withStatistics" && _monsido[1][1] != "true") {
              var a = encodeURIComponent(token),
                  b = encodeURIComponent(document.URL),
                  c = encodeURIComponent(getUname()),
                  f = encodeURIComponent(getUname());

              addMonsidoImage(monsidoTrackingUrl + "/?a="+a+"&b="+b+"&c="+c+"&d=&e=&f="+f+"&g=0&h=2");
            } else {
                var uniq = getCookie("monsido"),
                    random = getUname();

                if (!uniq) {
                    uniq = getUname();
                }

                setCookie("monsido", uniq, 30);

                addLoadEvent(function () {
                    var a = encodeURIComponent(_monsido[0][1]),
                        b = encodeURIComponent(document.URL),
                        c = encodeURIComponent(uniq),
                        d = encodeURIComponent(window.screen.width+"x"+window.screen.height),
                        e = encodeURIComponent(document.referrer),
                        f = encodeURIComponent(random),
                        g = 0;

                    try {
                        g = window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart;
                    } catch (err){};

                    g = encodeURIComponent(g);

                    addMonsidoImage(monsidoTrackingUrl + "/?a="+a+"&b="+b+"&c="+c+"&d="+d+"&e="+e+"&f="+f+"&g="+g+"&h=2")
                });
            }
        }
    } catch(err) {
    }
})(window, document);
