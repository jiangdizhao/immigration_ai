(function () {
    'use strict';

    /* Tag definitions */
    const AlwaysIgnoredTags = new Set([
        "SCRIPT",
        "STYLE",
        "IFRAME",
        "LINK",
        "META",
        "BR",
        "IMG",
    ]);
    const InlineOrIgnored = new Set([
        "SCRIPT",
        "STYLE",
        "IFRAME",
        "LINK",
        "META",
        "BR",
        "I",
        "B",
        "U",
        "S",
        "EM",
        "STRONG",
        "A",
        "SPAN",
        "ALT",
        "SUP",
        "SUB",
    ]);
    // nothing concerning about this at all!
    const nonDisplayed = (str) => !/[^\s\n\r\u00a0\u200b\u200d\u200c\ufeff\u2060]/.test(str);

    //Bad checksum function
    // function checksum(str) {
    //   return crypto.subtle.digest("SHA-512", new TextEncoder("utf-8").encode(str)).then(buf => {
    //       return Array.prototype.map.call(new Uint8Array(buf), x=>(('00'+x.toString(16)).slice(-2))).join('');
    //   });
    // }
    /**
     * Blaire 2023.08.30 - the original hash algorithm is https://stackoverflow.com/a/55926440
     * Joe's original comment above isn't quite fair. It's ugly, but it isn't actually bad practice
     *
     * Since the entire workflow relies on this so i've refactored it to make sure I didn't screw it up
     * hopefully a bit easier to follow now
     */
    // Get raw UTF-8 bytes of string, then get a SHA-512 hash of it
    // By creating a real array we don't need to do the Array.prototype stuff from the original,
    // which doesn't really matter but it's easier to convince typescript :)
    // Weconvert each byte to a hex string, then pad with zeroes to ensure it's 2-digits
    // rather than always adding two zeros to the start and then slicing to take the
    // last to digits like in the original
    async function checksum(str) {
        try {
            const encoded = new TextEncoder().encode(str);
            const rawHash = await crypto.subtle.digest("SHA-512", encoded);
            const byteArray = Array.from(new Uint8Array(rawHash));
            const hexString = byteArray
                .map((byte) => {
                return byte.toString(16).padStart(2, "0");
            })
                .join("");
            return hexString;
        }
        catch (e) {
            console.error("Error computing checksum:", e);
            return "";
        }
    }
    //export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    class Parser {
        annotatedElementCount = 0;
        /**
         * The annotator is used by the frontend javascript for change tracking
         * It is *not* actually relevant to the chunking algorithm.
         *
         * Original explanation by Joe:
         *  The checksums that this function generates may not be the same as the checksums generated when annotating the document.
         *  This is *Intended Behavior*
         *  The reason is this: As it stands, we *do* care about the HTML when we're calculating a translation (we want formatting translated too, after all)
         *  And if these change on two different pages, the hash will be different.
         *  However, when we're annotating that a chunk needs to be translated, currently, we only really bother getting a retranslation if the text content itself changes.
         *  This can be changed if it's a problem, but for now, doing it this way works well enough in my opinion.
         */
        findAltText(from) {
            const element = from;
            const queryAlt = element?.querySelector("[alt]");
            console.group("alt text query - annotateDOM");
            console.log("element:::: ", element);
            console.groupEnd();
            console.log("queryAlt:::: ", queryAlt);
            return false;
        }
        /**
         *
         * @param from The node to start the walk from
         * @returns    true
         */
        annotateDOM(from) {
            if (from?.nodeName == null)
                return false;
            if (InlineOrIgnored.has(from.nodeName))
                return false;
            if (from.nodeName === "#text") {
                if (from.textContent?.trim() === "")
                    return false;
                const span = document.createElement("span");
                span.appendChild(from.cloneNode(true));
                from.parentNode?.replaceChild(span, from);
                // Annotate the newly created span instead of returning false
                return this.annotateDOM(span);
            }
            /*  || from.getAttribute("translate") == "no" */
            if (lazyElementGuard(from)) {
                from.setAttribute("data-translation-block", "true");
                if (!from.getAttribute("data-translation-id")) {
                    from.setAttribute("data-translation-id", this.annotatedElementCount.toString());
                    this.annotatedElementCount++;
                }
            }
            let containsBlock = false;
            for (const child of from.childNodes) {
                containsBlock ||= this.annotateDOM(child);
            }
            if (containsBlock) {
                const fromElem = from;
                fromElem.setAttribute("data-translation-block", "false");
            }
            return true;
        }
        /**
         * Note to self: this is actually the translatepage method
         */
        async traverseDOM(from) {
            if (!lazyElementGuard(from))
                return [];
            // handle both our legacy domain-specific approach and also the industry standard translate="no"
            if (from.getAttribute("data-notranslate") != null) {
                /*  || from.getAttribute("translate") == "no" */
                return [];
            }
            let translationID = from.getAttribute("data-translation-id");
            if (!translationID) {
                this.annotateDOM(from);
                translationID = from.getAttribute("data-translation-id");
            }
            translationID ??= "0";
            const isBlock = nodeIsBlock(from);
            const hasOneChild = from.childNodes.length === 1 && !nodeIsBlock(from.parentNode);
            if (isBlock ||
                (hasOneChild &&
                    from.querySelector('[data-translation-block="true"]') === null)) {
                let useNode = from;
                if (hasOneChild) {
                    let node = from;
                    while (node.childNodes.length == 1 &&
                        node.childNodes[0].nodeName !== "#text")
                        node = node.childNodes[0];
                    useNode = node;
                }
                // This is problematic, because the
                if (lazyElementGuard(useNode) && useNode.innerHTML) {
                    const newChecksum = await checksum(useNode.innerHTML.trim());
                    const cs = useNode.getAttribute("data-translation-checksum");
                    let status = "ok";
                    if (cs != newChecksum && !useNode.getAttribute("data-translating")) {
                        status = "untranslated";
                    }
                    return [
                        {
                            translationId: translationID,
                            translationChecksum: newChecksum,
                            translationStatus: status,
                            elem: useNode,
                        },
                    ];
                }
            }
            const data = (await Promise.all(Array.from(from.children).map(async (child) => {
                return await this.traverseDOM(child);
            }))).flat(1);
            return data;
        }
    }
    function nodeIsBlock(from) {
        return (lazyElementGuard(from) &&
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            from.getAttribute("data-translation-block") !== undefined &&
            from.getAttribute("data-translation-block") !== "false");
    }
    function lazyElementGuard(thing) {
        if (thing == null)
            return false;
        const maybe = thing;
        if (maybe?.getAttribute != undefined)
            return true;
        return false;
    }

    var TranslationResponse;
    (function (TranslationResponse) {
        TranslationResponse[TranslationResponse["Success"] = 2] = "Success";
        TranslationResponse[TranslationResponse["Failure"] = 8] = "Failure";
        TranslationResponse[TranslationResponse["GenericError"] = 9] = "GenericError";
        // These below are not yet implemented in the public lambdas
        // PageIsNull = 10,
        // PreReleaseKeyInvalid = 11,
        // PageIsHidden = 12,
        // NoMatchingChunk = 13
    })(TranslationResponse || (TranslationResponse = {}));
    class Translator {
        configuration;
        parser;
        constructor(configuration, parser) {
            this.configuration = configuration;
            this.parser = parser;
        }
        makingChunkList = false;
        chunks = [];
        noTranslationMemory = false;
        static mtChunksIncluded = false;
        setRecordMode(recordMode, apiKey) {
            this.configuration.visualRecordMode = recordMode;
            this.configuration.visualRecordModeApiKey = apiKey;
        }
        async translate() {
            await this.translateOnce();
            // await sleep(2000);
        }
        async getDomListChunks(body) {
            return await this.parser.traverseDOM(body);
        }
        async getDomChunks(body) {
            const chunks = await this.parser.traverseDOM(body);
            await this.translatePage(chunks);
        }
        async checkTranslationOnClick(element) {
            const chunks = await this.parser.traverseDOM(element);
            await this.translatePage(chunks);
        }
        // Will continue looping on a timer indefinitely;
        async translateOnce() {
            const body = document.body;
            this.parser.annotateDOM(body);
            const chunksToTranslate = await this.parser.traverseDOM(body);
            console.log("chunks to translate ", chunksToTranslate);
            // We now (in theory) have a list of all pages that need translation
            await this.translatePage(chunksToTranslate);
        }
        elementHasAltText(element) {
            const hasAltAttr = element.hasAttribute("alt");
            return hasAltAttr;
        }
        async translatePage(chunks) {
            // Translate the title + all content on page
            await Promise.all([
                ...chunks.map(async (value) => {
                    if (value.elem.getAttribute("data-translated") === "true") {
                        return;
                    }
                    switch (value.translationStatus) {
                        case "stale":
                        case "untranslated":
                            if (AlwaysIgnoredTags.has(value.elem.nodeName) ||
                                this.elementHasAltText(value.elem)) {
                                console.log("skipping translation of this tag as it's always ignored: " +
                                    value.elem.nodeName);
                            }
                            else {
                                value.elem.setAttribute("data-translating", "true");
                                const changedResponse = await this.translateElement(value.elem, value.translationChecksum, value.translationId);
                                console.log("changedResponse : ", changedResponse);
                                if (value.elem.innerHTML) {
                                    value.elem.setAttribute("data-translation-checksum", await checksum(value.elem.innerHTML.trim()));
                                }
                                value.elem.setAttribute("data-translated", changedResponse.changed.toString());
                                if (changedResponse.chunkId != undefined) {
                                    value.elem.setAttribute("data-chunk-id", changedResponse.chunkId);
                                }
                                value.elem.removeAttribute("data-translating");
                                if (!changedResponse.changed &&
                                    this.configuration.visualReviewMode) {
                                    const htmlUntranslatedElement = value.elem;
                                    htmlUntranslatedElement.style.border = "2px dashed blue";
                                    value.elem = htmlUntranslatedElement;
                                }
                            }
                            break;
                        case "ok":
                            if (this.configuration.visualRecordMode) {
                                if (AlwaysIgnoredTags.has(value.elem.nodeName)) {
                                    console.log("skipping translation of this tag as it's always ignored: " +
                                        value.elem.nodeName);
                                }
                                else {
                                    const changedResponse = await this.translateElement(value.elem, value.translationChecksum, value.translationId);
                                    console.log("changedResponse : ", changedResponse);
                                    if (value.elem.innerHTML) {
                                        value.elem.setAttribute("data-translation-checksum", await checksum(value.elem.innerHTML.trim()));
                                    }
                                }
                            }
                            break;
                    }
                }),
                this.translateTitle(),
            ]);
        }
        async makeChunkList() {
            this.makingChunkList = true;
            await this.parser.traverseDOM(document.body);
            await this.translateOnce();
            return this.chunks
                .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
                .map((x) => x[1]);
        }
        async translateElement(elReal, translationChecksum, translationID) {
            if (AlwaysIgnoredTags.has(elReal.nodeName))
                return { changed: false, chunkId: undefined };
            if (elReal.getAttribute("data-notranslate") != null ||
                elReal.getAttribute("translate") == "no") {
                // In theory this should be handled by the annotator / parser, but just in case we check again
                return { changed: false, chunkId: undefined };
            }
            // Check if the element's children are *all* text nodes.
            let allText = true;
            if (elReal.childNodes.length > 1) {
                await this.getDomChunks(elReal);
                for (const node of elReal.childNodes) {
                    allText &&= node.nodeName === "#text";
                    // If one of the children is a block it will be translated separately, so we break here
                    if (node.getAttribute !== undefined) {
                        if (node.getAttribute("data-translation-block")) {
                            return { changed: false, chunkId: undefined };
                        }
                    }
                }
            }
            else if (elReal.childNodes.length == 1) {
                allText = elReal.childNodes[0].nodeName === "#text";
            }
            if (nonDisplayed(elReal.textContent ?? ""))
                return { changed: false, chunkId: undefined };
            if (elReal.getAttribute("data-translated") === "true") {
                this.warnInstability(elReal, translationChecksum);
            }
            if (allText) {
                // Trivial case: the node is *just text*
                const trimmed = elReal.innerHTML.trim();
                const newChecksum = await checksum(trimmed);
                const response = await this.translationTransformation(trimmed, newChecksum, window.location, translationID);
                const translated = response.responseHTML;
                // console.log("recieved API translation response: ");
                // console.log("input: " + trimmed);
                // console.log("translated: " + translated);
                // if the translation is the same as the original, we don't need to do anything
                if (translated != trimmed) {
                    // console.log(
                    //   "ALLTEXT CASE Values differed, so setting innerHTML for Translated " +
                    //     trimmed +
                    //     " to " +
                    //     translated,
                    // );
                    elReal.innerHTML = translated;
                    console.log("ELREAL", elReal);
                    if (response.highlightChunk != null && response.highlightChunk) {
                        elReal.style.border = "5px dashed red";
                    }
                    return { changed: true, chunkId: response.chunkId };
                }
            }
            else {
                let node = elReal;
                while (node.childNodes.length == 1 && node.nodeName !== "#text") {
                    node = node.childNodes[0];
                }
                if (node.nodeName === "#text") {
                    // i.e. div.container > h1 > a > span > #text
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const trimmed = node.textContent.trim();
                    const newChecksum = await checksum(trimmed);
                    const response = await this.translationTransformation(trimmed, newChecksum, window.location, translationID);
                    const translated = response.responseHTML;
                    if (node.textContent !== translated) {
                        console.log("ELSE SINGLE TEXT DESCENDANT: values differed, so setting innerHTML for " +
                            trimmed +
                            " to " +
                            translated);
                        node.textContent = translated;
                        console.log("ELREAL", node);
                        if (response.highlightChunk != null && response.highlightChunk) {
                            node.style.border = "5px dashed red";
                        }
                        return { changed: true, chunkId: response.chunkId };
                    }
                    else {
                        console.log("ELSE SINGLE TEXT DESCENDANT: values same (" + trimmed + ")");
                    }
                    console.log("recieved API translation response: ");
                    console.log("input: " + trimmed);
                    console.log("translated: " + translated);
                    node.textContent = translated;
                }
                else {
                    const elemNode = node;
                    const trimmed = elemNode.innerHTML.trim();
                    const newChecksum = await checksum(trimmed);
                    const response = await this.translationTransformation(trimmed, newChecksum, window.location, translationID);
                    const translated = response.responseHTML;
                    console.log("recieved API translation response: ");
                    console.log("input: " + trimmed);
                    console.log("translated: " + translated);
                    // if the translation is the same as the original, we don't need to do anything
                    if (translated != trimmed) {
                        console.log("ELSE CASE Values differed, so setting innerHTML for Translated " +
                            trimmed +
                            " to " +
                            translated);
                        elemNode.innerHTML = translated;
                        console.log("ELREAL", elemNode);
                        if (response.highlightChunk != null && response.highlightChunk) {
                            elemNode.style.border = "5px dashed red";
                        }
                        return { changed: true, chunkId: response.chunkId };
                    }
                    else {
                        console.log("ELSE CASE didn't convert the element innerHTML because there was no point doing so (" +
                            trimmed +
                            ")");
                    }
                }
            }
            return { changed: false, chunkId: undefined };
        }
        warnInstability(elReal, checksum) {
            console.warn("Possible instability (or dynamic content (changing text) detected)");
            console.warn("If the text changed to an English string, it will be translated again and there'll be no issues.");
            console.warn("If a foreign language string was mutated, however, there is a risk of unstable and highly questionable translations.");
            console.log("Element Checksum attribute: " +
                elReal.getAttribute("data-translation-checksum"));
            console.log("Element Contents: " + elReal.innerHTML);
            console.log("Checksum we expected: " + checksum);
        }
        async translationTransformation(input, checksum$1, page, translationID) {
            if (this.makingChunkList) {
                const cleanInput = stripAnnotationSpans(input);
                this.chunks.push([parseInt(translationID), cleanInput]);
                return { responseHTML: input };
            }
            else if (this.configuration.Language === "en" &&
                !this.configuration.visualRecordMode) {
                console.log(`Requested Translate but language set to 'en' so no translation performed: ${input}`);
                return { responseHTML: input };
            }
            else if (!this.configuration.supportedLanguages.some((opt) => opt.value == this.configuration.Language) &&
                this.configuration.prereleaseData.prereleaseKey == undefined &&
                !this.configuration.visualRecordMode) {
                console.log("Requested translate but no prerelease key set & language not available");
                return { responseHTML: input };
            }
            console.log(`Requesting API translation for input: ${input} with hash: ${checksum$1}`);
            const apiPath = this.configuration.urlPathForEndpoint("translation");
            let urlString = "";
            if (page.href.endsWith("#")) {
                urlString = page.href.split("#")[0];
            }
            if (page.href.endsWith("/")) {
                urlString = page.href.replace(/\/$/, "");
            }
            if (urlString === "") {
                urlString = page.href;
            }
            if (apiPath == null || apiPath == "")
                return { responseHTML: input };
            this.noTranslationMemory = false;
            const translationData = await fetch(apiPath, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    Checksum: checksum$1,
                    RawChunkText: input,
                    RequestedLanguage: this.configuration.Language,
                    Page: urlString,
                    PreRelease: this.configuration.prereleaseData?.prereleaseKey != null,
                    PreReleaseKey: this.configuration.prereleaseData?.prereleaseKey ?? "",
                    ManualRecord: this.configuration.visualRecordMode,
                    recordModeKey: this.configuration.visualRecordModeApiKey,
                    // PreRelease:
                    //   this.configuration.prereleaseKey != null &&
                    //   this.configuration.prereleaseKey != "",
                    // PreReleaseKey: this.configuration.prereleaseKey ?? "",
                }),
            });
            let translationResult = await translationData.json();
            console.log(translationResult);
            if (this.configuration.visualRecordMode && translationResult.result == 8) {
                this.noTranslationMemory = true;
                console.log("translation memory::: ", this.noTranslationMemory);
            }
            if (typeof translationResult === "object" &&
                translationResult !== null &&
                !this.configuration.visualRecordMode) {
                const resObj = translationResult;
                const result = resObj.ResponseHTML;
                const highlightChunk = resObj.highlightChunk;
                const mtChunkTranslation = resObj.mtChunkTranslation ?? false;
                const chunkId = resObj.chunkId;
                if (typeof result === "string") {
                    console.log("Successfully found first time");
                    if (Translator.mtChunksIncluded === false) {
                        Translator.mtChunksIncluded = mtChunkTranslation ?? false;
                    }
                    if (typeof highlightChunk === "boolean" && highlightChunk == true) {
                        const returnData = {
                            responseHTML: result,
                            highlightChunk: highlightChunk,
                            chunkId: chunkId,
                        };
                        return returnData;
                    }
                    return { responseHTML: result, chunkId: chunkId };
                }
                console.log("Retrying with raw chunk");
                translationResult = await fetch(apiPath, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        Checksum: checksum$1,
                        RawChunkText: input,
                        RequestedLanguage: this.configuration.Language,
                        Page: urlString,
                        PreRelease: this.configuration.prereleaseData?.prereleaseKey != null,
                        PreReleaseKey: this.configuration.prereleaseData?.prereleaseKey ?? "",
                        ManualRecord: this.configuration.visualRecordMode,
                        // PreRelease:
                        //   this.configuration.prereleaseData != null &&
                        //   this.configuration.prereleaseData != "",
                        // PreReleaseKey: this.configuration.prereleaseKey ?? "",
                    }),
                }).then((val) => val.json());
                if (typeof translationResult === "object" && translationResult !== null) {
                    const resObj = translationResult;
                    const result = resObj.responseHTML;
                    const highlightChunk = resObj.highlightChunk;
                    const mtChunkTranslation = resObj.mtChunkTranslation ?? false;
                    if (Translator.mtChunksIncluded === false) {
                        Translator.mtChunksIncluded = mtChunkTranslation ?? false;
                    }
                    const chunkId = resObj.chunkId;
                    if (typeof result === "string") {
                        console.log("Found on retry!");
                        if (typeof highlightChunk === "boolean" && highlightChunk == true) {
                            const returnData = {
                                responseHTML: result,
                                highlightChunk: highlightChunk,
                                chunkId: chunkId,
                            };
                            return returnData;
                        }
                        return { responseHTML: result, chunkId: chunkId };
                    }
                    console.log("retry failed too :(");
                }
                // Fallback: strip annotation spans added by annotateDOM and retry,
                // in case existing translations were stored without span wrappers
                const strippedInput = stripAnnotationSpans(input);
                if (strippedInput !== input) {
                    console.log("Retrying without annotation spans");
                    const strippedChecksum = await checksum(strippedInput);
                    const strippedResult = await fetch(apiPath, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            Checksum: strippedChecksum,
                            RawChunkText: strippedInput,
                            RequestedLanguage: this.configuration.Language,
                            Page: urlString,
                            PreRelease: this.configuration.prereleaseData?.prereleaseKey != null,
                            PreReleaseKey: this.configuration.prereleaseData?.prereleaseKey ?? "",
                            ManualRecord: this.configuration.visualRecordMode,
                            recordModeKey: this.configuration.visualRecordModeApiKey,
                        }),
                    }).then((val) => val.json());
                    if (typeof strippedResult === "object" &&
                        strippedResult !== null) {
                        const resObj = strippedResult;
                        const result = resObj.ResponseHTML ??
                            resObj.responseHTML;
                        const highlightChunk = resObj.highlightChunk;
                        const mtChunkTranslation = resObj.mtChunkTranslation ?? false;
                        const chunkId = resObj.chunkId;
                        if (typeof result === "string") {
                            console.log("Found on span-stripped retry!");
                            if (Translator.mtChunksIncluded === false) {
                                Translator.mtChunksIncluded = mtChunkTranslation ?? false;
                            }
                            if (typeof highlightChunk === "boolean" &&
                                highlightChunk == true) {
                                return {
                                    responseHTML: result,
                                    highlightChunk: highlightChunk,
                                    chunkId: chunkId,
                                };
                            }
                            return { responseHTML: result, chunkId: chunkId };
                        }
                        console.log("span-stripped retry failed too");
                    }
                }
                // Fallback: strip zero-width spaces from the (already span-stripped) input,
                // in case the database chunk was migrated to a version without ZWS
                const baseInput = strippedInput !== input ? strippedInput : input;
                const zwsStrippedInput = stripZeroWidthSpaces(baseInput);
                if (zwsStrippedInput !== baseInput) {
                    console.log("Retrying without zero-width spaces");
                    const zwsChecksum = await checksum(zwsStrippedInput);
                    const zwsResult = await fetch(apiPath, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            Checksum: zwsChecksum,
                            RawChunkText: zwsStrippedInput,
                            RequestedLanguage: this.configuration.Language,
                            Page: urlString,
                            PreRelease: this.configuration.prereleaseData?.prereleaseKey != null,
                            PreReleaseKey: this.configuration.prereleaseData?.prereleaseKey ?? "",
                            ManualRecord: this.configuration.visualRecordMode,
                            recordModeKey: this.configuration.visualRecordModeApiKey,
                        }),
                    }).then((val) => val.json());
                    if (typeof zwsResult === "object" && zwsResult !== null) {
                        const resObj = zwsResult;
                        const result = resObj.ResponseHTML ??
                            resObj.responseHTML;
                        const highlightChunk = resObj.highlightChunk;
                        const mtChunkTranslation = resObj.mtChunkTranslation ?? false;
                        const chunkId = resObj.chunkId;
                        if (typeof result === "string") {
                            console.log("Found on ZWS-stripped retry!");
                            if (Translator.mtChunksIncluded === false) {
                                Translator.mtChunksIncluded = mtChunkTranslation ?? false;
                            }
                            if (typeof highlightChunk === "boolean" &&
                                highlightChunk == true) {
                                return {
                                    responseHTML: result,
                                    highlightChunk: highlightChunk,
                                    chunkId: chunkId,
                                };
                            }
                            return { responseHTML: result, chunkId: chunkId };
                        }
                        console.log("ZWS-stripped retry failed too");
                    }
                }
            }
            return { responseHTML: input };
        }
        titleHash = null;
        async translateTitle() {
            const trimmed = document.title.trim();
            const cs = await checksum(trimmed);
            if (this.titleHash != cs) {
                const response = await this.translationTransformation(trimmed, cs, window.location, "title");
                const translated = response.responseHTML;
                document.title = translated;
                this.titleHash = await checksum(translated);
            }
        }
        refresh() {
            window.location = window.location;
        }
    }
    /**
     * Strips <span> tags inserted by annotateDOM when wrapping text nodes.
     * Matches bare <span> tags and spans with data-translation-* attributes.
     * Spans with other attributes (classes, ids, styles, etc.) are left intact
     * as they are original page content.
     */
    function stripAnnotationSpans(html) {
        return html.replace(/<span(?:\s+data-translation-[^>]*)?>|<\/span>/g, "");
    }
    /**
     * Strips zero-width space characters (U+200B) from the input.
     */
    function stripZeroWidthSpaces(html) {
        return html.replace(/\u200B/g, "");
    }

    var WidgetVisibility;
    (function (WidgetVisibility) {
        WidgetVisibility[WidgetVisibility["Hidden"] = 0] = "Hidden";
        WidgetVisibility[WidgetVisibility["Visible"] = 1] = "Visible";
        WidgetVisibility[WidgetVisibility["ShowFeedback"] = 2] = "ShowFeedback";
        WidgetVisibility[WidgetVisibility["Failure"] = 8] = "Failure";
        WidgetVisibility[WidgetVisibility["GenericError"] = 9] = "GenericError";
        WidgetVisibility[WidgetVisibility["APIPathNull"] = 9] = "APIPathNull";
    })(WidgetVisibility || (WidgetVisibility = {}));
    class Configuration {
        constructor(data, extra) {
            this._configuration = data;
            // this.displayOption = extra?.displayOption ?? this.displayOption
        }
        _configuration;
        supportedLanguages = [];
        Marionette = false;
        visualReviewMode = false;
        visualRecordMode = false;
        visualRecordModeApiKey = "";
        widgetIsVisible = false;
        feedBackIsVisible = false;
        visibilityKey;
        baseURL;
        fullURL;
        urlPath;
        queryString;
        langOverride;
        prereleaseData = { prereleaseKey: undefined, jobExists: undefined, keyValid: undefined };
        displayOption = "homeaffairs";
        urlPathForEndpoint(path) {
            // If the configuration explicitly sets 'null' then return null, as that means
            // the api calls are explicitly disabled.
            if (this._configuration.apiBaseURL === null) {
                return null;
            }
            else if (this._configuration.apiBaseURL != "") {
                return this._configuration.apiBaseURL + path;
            }
            else {
                // javascript things: this is the legacy / undefined case
                return "";
            }
        }
        urlPathForCDN() {
            if (this._configuration.cdnURL === null) {
                return "";
            }
            else if (this._configuration.cdnURL == "") {
                return "";
            }
            return this._configuration.cdnURL;
        }
        get Language() {
            return this.langOverride ?? getCookie("language")?.toString() ?? "en";
        }
        set Language(lang) {
            setCookie("language", lang);
        }
        get LanguageText() {
            return getCookie("language-text")?.toString() ?? "English";
        }
        set LanguageText(text) {
            setCookie("language-text", text);
        }
        get LanguageTranslated() {
            return getCookie("language-translated")?.toString() ?? "English";
        }
        set LanguageTranslated(translated) {
            setCookie("language-translated", translated);
        }
        /**
         *
         * @param to The newly-selected language
         * @returns true if the new language was different from the old language
         */
        setNewLanguage(to) {
            if (to.value === this.Language)
                return false;
            // console.log("setting the new language because the value was valid");
            if (to.value != null)
                this.Language = to.value;
            if (to.text != null)
                this.LanguageText = to.text;
            if (to.translated != null)
                this.LanguageTranslated = to.translated;
            return true;
        }
        async getWidgetVisibility() {
            let resultObject = {
                Result: WidgetVisibility.Failure,
                TranslationServiceDisclaimer: "",
                BackgroundColour: "",
                BarBackgroundColour: "",
                CssContent: "",
                OverwriteEmbeddedUi: false,
                TextColour: "",
                TextOnBackgroundColour: "",
            };
            const apiPath = this.urlPathForEndpoint("visibility");
            let urlString = "";
            if (window.location.href.endsWith("#")) {
                urlString = window.location.href.split("#")[0];
            }
            if (window.location.href.endsWith("/")) {
                urlString = window.location.href.replace(/\/$/, "");
            }
            if (urlString === "") {
                urlString = window.location.href;
            }
            var encoded = window.btoa(urlString);
            if (apiPath == null)
                return resultObject;
            const visibilityResponse = await fetch(`${apiPath}?encodedPageUrl=${encoded}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            try {
                const responseData = await visibilityResponse.json();
                if (responseData) {
                    resultObject.Result = responseData.Result;
                    resultObject.TranslationServiceDisclaimer =
                        responseData.TranslationServiceDisclaimer ?? "";
                    resultObject.OverwriteEmbeddedUi =
                        responseData.OverwriteEmbeddedUi ?? false;
                    resultObject.BackgroundColour = responseData.BackgroundColour ?? "";
                    resultObject.BarBackgroundColour =
                        responseData.BarBackgroundColour ?? "";
                    resultObject.TextOnBackgroundColour =
                        responseData.TextOnBackgroundColour ?? "";
                    resultObject.TextColour = responseData.TextColour ?? "";
                    resultObject.CssContent = responseData.CssContent ?? "";
                    return resultObject;
                }
                else {
                    throw new Error("result of visibilty api call wasn't an object");
                }
            }
            catch (e) {
                console.error("threw error getting visibility", e);
                return resultObject;
            }
        }
        async getWidgetVisibilityPost() {
            const apiPath = this.urlPathForEndpoint("visibility");
            if (apiPath == null)
                return false;
            const visibilityResponse = await fetch(apiPath, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    BaseURL: this.baseURL,
                    FullURL: this.fullURL,
                    VisibilityKey: this.visibilityKey,
                }),
            });
            try {
                const responseData = await visibilityResponse.json();
                if (responseData) {
                    const resultObject = responseData;
                    if (resultObject.Result != 8) {
                        return resultObject.Result;
                    }
                    else {
                        return false;
                    }
                }
                else {
                    throw new Error("result of visibilty api call wasn't an object");
                }
            }
            catch (e) {
                console.error("threw error getting visibility", e);
                return undefined;
            }
        }
        //This called the new cached get function of get supported languages. Use when HA approves the use of caches
        async getSupportedLanguages() {
            const apiPath = this.urlPathForEndpoint("languages");
            let urlString = "";
            if (window.location.href.endsWith("#")) {
                urlString = window.location.href.split("#")[0];
            }
            if (window.location.href.endsWith("/")) {
                urlString = window.location.href.replace(/\/$/, "");
            }
            if (urlString === "") {
                urlString = window.location.href;
            }
            var encoded = window.btoa(urlString);
            if (apiPath == null)
                return [];
            const languagesResponse = await fetch(`${apiPath}?encodedPageUrl=${encoded}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            try {
                const responseData = await languagesResponse.json();
                if (Array.isArray(responseData)) {
                    const mappedArrary = responseData.map((x) => {
                        return {
                            value: x.languageCode,
                            text: x.languageName,
                            translated: x.localLanguageName,
                            direction: x.direction,
                            available: true,
                            prereleaseData: {
                                jobExists: x?.prereleaseInfo?.jobExists,
                                keyValid: x?.prereleaseInfo?.keyValid,
                            },
                        };
                    });
                    console.log("before return ", mappedArrary);
                    return mappedArrary.sort((a, b) => a.text.localeCompare(b.text));
                }
                else {
                    throw new Error("result of languages api call wasn't an array");
                }
            }
            catch (e) {
                console.error("died getting languages", e);
                return undefined;
            }
        }
        //this is the post version of get supported languages
        async getSupportedLanguagesGetFunction() {
            const apiPath = this.urlPathForEndpoint("languages");
            let urlString = "";
            if (window.location.href.endsWith("#")) {
                urlString = window.location.href.split("#")[0];
            }
            if (window.location.href.endsWith("/")) {
                urlString = window.location.href.replace(/\/$/, "");
            }
            if (urlString === "") {
                urlString = window.location.href;
            }
            if (apiPath == null)
                return [];
            const languagesResponse = await fetch(apiPath, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    Page: urlString,
                }),
            });
            try {
                const responseData = await languagesResponse.json();
                if (Array.isArray(responseData)) {
                    const mappedArrary = responseData.map((x) => {
                        return {
                            value: x.languageCode,
                            text: x.languageName,
                            translated: x.localLanguageName,
                            direction: x.direction,
                            available: true,
                            prereleaseData: {
                                jobExists: x?.prereleaseInfo?.jobExists,
                                keyValid: x?.prereleaseInfo?.keyValid,
                            },
                        };
                    });
                    console.log("before return ", mappedArrary);
                    return mappedArrary.sort((a, b) => a.text.localeCompare(b.text));
                }
                else {
                    throw new Error("result of languages api call wasn't an array");
                }
            }
            catch (e) {
                console.error("died getting languages", e);
                return undefined;
            }
        }
    }
    async function loadConfigFromFileUrl(fromUrl) {
        try {
            const configResponse = await fetch(fromUrl);
            if (!configResponse.ok)
                throw new Error("config fetch response not 200OK");
            const rawConfigJson = await configResponse.json();
            // actual validation? in my javascript?
            if (rawConfigJson === null || typeof rawConfigJson != "object")
                throw new Error("config data was not an object");
            const maybeConfig = rawConfigJson;
            if (maybeConfig.apiBaseURL == null)
                throw new Error("Missing API base URL field in configuration");
            if (maybeConfig.apiBaseURL == "")
                throw new Error("Empty API URL in config file");
            if (maybeConfig.cdnURL == null)
                throw new Error("Missing cdn URL field in configuration");
            if (maybeConfig.apiBaseURL == "")
                throw new Error("Empty cdn URL in config file");
            return new Configuration(maybeConfig);
        }
        catch (e) {
            console.error("Failed to load config from " + fromUrl, e);
            throw new Error("Couldn't load config from " + fromUrl);
        }
    }
    function getCookie(name) {
        const cookie = document.cookie
            .split("; ")
            .map((x) => x.split("="))
            .find((x) => x[0] === name);
        if (!cookie) {
            return null;
        }
        return cookie[1];
    }
    function setCookie(name, value) {
        document.cookie =
            name + "=" + value + "; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT";
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /*! @license DOMPurify 3.3.1 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.3.1/LICENSE */

    const {
      entries,
      setPrototypeOf,
      isFrozen,
      getPrototypeOf,
      getOwnPropertyDescriptor
    } = Object;
    let {
      freeze,
      seal,
      create
    } = Object; // eslint-disable-line import/no-mutable-exports
    let {
      apply,
      construct
    } = typeof Reflect !== 'undefined' && Reflect;
    if (!freeze) {
      freeze = function freeze(x) {
        return x;
      };
    }
    if (!seal) {
      seal = function seal(x) {
        return x;
      };
    }
    if (!apply) {
      apply = function apply(func, thisArg) {
        for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
          args[_key - 2] = arguments[_key];
        }
        return func.apply(thisArg, args);
      };
    }
    if (!construct) {
      construct = function construct(Func) {
        for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
          args[_key2 - 1] = arguments[_key2];
        }
        return new Func(...args);
      };
    }
    const arrayForEach = unapply(Array.prototype.forEach);
    const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
    const arrayPop = unapply(Array.prototype.pop);
    const arrayPush = unapply(Array.prototype.push);
    const arraySplice = unapply(Array.prototype.splice);
    const stringToLowerCase = unapply(String.prototype.toLowerCase);
    const stringToString = unapply(String.prototype.toString);
    const stringMatch = unapply(String.prototype.match);
    const stringReplace = unapply(String.prototype.replace);
    const stringIndexOf = unapply(String.prototype.indexOf);
    const stringTrim = unapply(String.prototype.trim);
    const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
    const regExpTest = unapply(RegExp.prototype.test);
    const typeErrorCreate = unconstruct(TypeError);
    /**
     * Creates a new function that calls the given function with a specified thisArg and arguments.
     *
     * @param func - The function to be wrapped and called.
     * @returns A new function that calls the given function with a specified thisArg and arguments.
     */
    function unapply(func) {
      return function (thisArg) {
        if (thisArg instanceof RegExp) {
          thisArg.lastIndex = 0;
        }
        for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
          args[_key3 - 1] = arguments[_key3];
        }
        return apply(func, thisArg, args);
      };
    }
    /**
     * Creates a new function that constructs an instance of the given constructor function with the provided arguments.
     *
     * @param func - The constructor function to be wrapped and called.
     * @returns A new function that constructs an instance of the given constructor function with the provided arguments.
     */
    function unconstruct(Func) {
      return function () {
        for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
          args[_key4] = arguments[_key4];
        }
        return construct(Func, args);
      };
    }
    /**
     * Add properties to a lookup table
     *
     * @param set - The set to which elements will be added.
     * @param array - The array containing elements to be added to the set.
     * @param transformCaseFunc - An optional function to transform the case of each element before adding to the set.
     * @returns The modified set with added elements.
     */
    function addToSet(set, array) {
      let transformCaseFunc = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : stringToLowerCase;
      if (setPrototypeOf) {
        // Make 'in' and truthy checks like Boolean(set.constructor)
        // independent of any properties defined on Object.prototype.
        // Prevent prototype setters from intercepting set as a this value.
        setPrototypeOf(set, null);
      }
      let l = array.length;
      while (l--) {
        let element = array[l];
        if (typeof element === 'string') {
          const lcElement = transformCaseFunc(element);
          if (lcElement !== element) {
            // Config presets (e.g. tags.js, attrs.js) are immutable.
            if (!isFrozen(array)) {
              array[l] = lcElement;
            }
            element = lcElement;
          }
        }
        set[element] = true;
      }
      return set;
    }
    /**
     * Clean up an array to harden against CSPP
     *
     * @param array - The array to be cleaned.
     * @returns The cleaned version of the array
     */
    function cleanArray(array) {
      for (let index = 0; index < array.length; index++) {
        const isPropertyExist = objectHasOwnProperty(array, index);
        if (!isPropertyExist) {
          array[index] = null;
        }
      }
      return array;
    }
    /**
     * Shallow clone an object
     *
     * @param object - The object to be cloned.
     * @returns A new object that copies the original.
     */
    function clone(object) {
      const newObject = create(null);
      for (const [property, value] of entries(object)) {
        const isPropertyExist = objectHasOwnProperty(object, property);
        if (isPropertyExist) {
          if (Array.isArray(value)) {
            newObject[property] = cleanArray(value);
          } else if (value && typeof value === 'object' && value.constructor === Object) {
            newObject[property] = clone(value);
          } else {
            newObject[property] = value;
          }
        }
      }
      return newObject;
    }
    /**
     * This method automatically checks if the prop is function or getter and behaves accordingly.
     *
     * @param object - The object to look up the getter function in its prototype chain.
     * @param prop - The property name for which to find the getter function.
     * @returns The getter function found in the prototype chain or a fallback function.
     */
    function lookupGetter(object, prop) {
      while (object !== null) {
        const desc = getOwnPropertyDescriptor(object, prop);
        if (desc) {
          if (desc.get) {
            return unapply(desc.get);
          }
          if (typeof desc.value === 'function') {
            return unapply(desc.value);
          }
        }
        object = getPrototypeOf(object);
      }
      function fallbackValue() {
        return null;
      }
      return fallbackValue;
    }

    const html$1 = freeze(['a', 'abbr', 'acronym', 'address', 'area', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'big', 'blink', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'content', 'data', 'datalist', 'dd', 'decorator', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'element', 'em', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map', 'mark', 'marquee', 'menu', 'menuitem', 'meter', 'nav', 'nobr', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'search', 'section', 'select', 'shadow', 'slot', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr']);
    const svg$1 = freeze(['svg', 'a', 'altglyph', 'altglyphdef', 'altglyphitem', 'animatecolor', 'animatemotion', 'animatetransform', 'circle', 'clippath', 'defs', 'desc', 'ellipse', 'enterkeyhint', 'exportparts', 'filter', 'font', 'g', 'glyph', 'glyphref', 'hkern', 'image', 'inputmode', 'line', 'lineargradient', 'marker', 'mask', 'metadata', 'mpath', 'part', 'path', 'pattern', 'polygon', 'polyline', 'radialgradient', 'rect', 'stop', 'style', 'switch', 'symbol', 'text', 'textpath', 'title', 'tref', 'tspan', 'view', 'vkern']);
    const svgFilters = freeze(['feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence']);
    // List of SVG elements that are disallowed by default.
    // We still need to know them so that we can do namespace
    // checks properly in case one wants to add them to
    // allow-list.
    const svgDisallowed = freeze(['animate', 'color-profile', 'cursor', 'discard', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri', 'foreignobject', 'hatch', 'hatchpath', 'mesh', 'meshgradient', 'meshpatch', 'meshrow', 'missing-glyph', 'script', 'set', 'solidcolor', 'unknown', 'use']);
    const mathMl$1 = freeze(['math', 'menclose', 'merror', 'mfenced', 'mfrac', 'mglyph', 'mi', 'mlabeledtr', 'mmultiscripts', 'mn', 'mo', 'mover', 'mpadded', 'mphantom', 'mroot', 'mrow', 'ms', 'mspace', 'msqrt', 'mstyle', 'msub', 'msup', 'msubsup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'mprescripts']);
    // Similarly to SVG, we want to know all MathML elements,
    // even those that we disallow by default.
    const mathMlDisallowed = freeze(['maction', 'maligngroup', 'malignmark', 'mlongdiv', 'mscarries', 'mscarry', 'msgroup', 'mstack', 'msline', 'msrow', 'semantics', 'annotation', 'annotation-xml', 'mprescripts', 'none']);
    const text = freeze(['#text']);

    const html = freeze(['accept', 'action', 'align', 'alt', 'autocapitalize', 'autocomplete', 'autopictureinpicture', 'autoplay', 'background', 'bgcolor', 'border', 'capture', 'cellpadding', 'cellspacing', 'checked', 'cite', 'class', 'clear', 'color', 'cols', 'colspan', 'controls', 'controlslist', 'coords', 'crossorigin', 'datetime', 'decoding', 'default', 'dir', 'disabled', 'disablepictureinpicture', 'disableremoteplayback', 'download', 'draggable', 'enctype', 'enterkeyhint', 'exportparts', 'face', 'for', 'headers', 'height', 'hidden', 'high', 'href', 'hreflang', 'id', 'inert', 'inputmode', 'integrity', 'ismap', 'kind', 'label', 'lang', 'list', 'loading', 'loop', 'low', 'max', 'maxlength', 'media', 'method', 'min', 'minlength', 'multiple', 'muted', 'name', 'nonce', 'noshade', 'novalidate', 'nowrap', 'open', 'optimum', 'part', 'pattern', 'placeholder', 'playsinline', 'popover', 'popovertarget', 'popovertargetaction', 'poster', 'preload', 'pubdate', 'radiogroup', 'readonly', 'rel', 'required', 'rev', 'reversed', 'role', 'rows', 'rowspan', 'spellcheck', 'scope', 'selected', 'shape', 'size', 'sizes', 'slot', 'span', 'srclang', 'start', 'src', 'srcset', 'step', 'style', 'summary', 'tabindex', 'title', 'translate', 'type', 'usemap', 'valign', 'value', 'width', 'wrap', 'xmlns', 'slot']);
    const svg = freeze(['accent-height', 'accumulate', 'additive', 'alignment-baseline', 'amplitude', 'ascent', 'attributename', 'attributetype', 'azimuth', 'basefrequency', 'baseline-shift', 'begin', 'bias', 'by', 'class', 'clip', 'clippathunits', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile', 'color-rendering', 'cx', 'cy', 'd', 'dx', 'dy', 'diffuseconstant', 'direction', 'display', 'divisor', 'dur', 'edgemode', 'elevation', 'end', 'exponent', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'filterunits', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'fx', 'fy', 'g1', 'g2', 'glyph-name', 'glyphref', 'gradientunits', 'gradienttransform', 'height', 'href', 'id', 'image-rendering', 'in', 'in2', 'intercept', 'k', 'k1', 'k2', 'k3', 'k4', 'kerning', 'keypoints', 'keysplines', 'keytimes', 'lang', 'lengthadjust', 'letter-spacing', 'kernelmatrix', 'kernelunitlength', 'lighting-color', 'local', 'marker-end', 'marker-mid', 'marker-start', 'markerheight', 'markerunits', 'markerwidth', 'maskcontentunits', 'maskunits', 'max', 'mask', 'mask-type', 'media', 'method', 'mode', 'min', 'name', 'numoctaves', 'offset', 'operator', 'opacity', 'order', 'orient', 'orientation', 'origin', 'overflow', 'paint-order', 'path', 'pathlength', 'patterncontentunits', 'patterntransform', 'patternunits', 'points', 'preservealpha', 'preserveaspectratio', 'primitiveunits', 'r', 'rx', 'ry', 'radius', 'refx', 'refy', 'repeatcount', 'repeatdur', 'restart', 'result', 'rotate', 'scale', 'seed', 'shape-rendering', 'slope', 'specularconstant', 'specularexponent', 'spreadmethod', 'startoffset', 'stddeviation', 'stitchtiles', 'stop-color', 'stop-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke', 'stroke-width', 'style', 'surfacescale', 'systemlanguage', 'tabindex', 'tablevalues', 'targetx', 'targety', 'transform', 'transform-origin', 'text-anchor', 'text-decoration', 'text-rendering', 'textlength', 'type', 'u1', 'u2', 'unicode', 'values', 'viewbox', 'visibility', 'version', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'width', 'word-spacing', 'wrap', 'writing-mode', 'xchannelselector', 'ychannelselector', 'x', 'x1', 'x2', 'xmlns', 'y', 'y1', 'y2', 'z', 'zoomandpan']);
    const mathMl = freeze(['accent', 'accentunder', 'align', 'bevelled', 'close', 'columnsalign', 'columnlines', 'columnspan', 'denomalign', 'depth', 'dir', 'display', 'displaystyle', 'encoding', 'fence', 'frame', 'height', 'href', 'id', 'largeop', 'length', 'linethickness', 'lspace', 'lquote', 'mathbackground', 'mathcolor', 'mathsize', 'mathvariant', 'maxsize', 'minsize', 'movablelimits', 'notation', 'numalign', 'open', 'rowalign', 'rowlines', 'rowspacing', 'rowspan', 'rspace', 'rquote', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier', 'selection', 'separator', 'separators', 'stretchy', 'subscriptshift', 'supscriptshift', 'symmetric', 'voffset', 'width', 'xmlns']);
    const xml = freeze(['xlink:href', 'xml:id', 'xlink:title', 'xml:space', 'xmlns:xlink']);

    // eslint-disable-next-line unicorn/better-regex
    const MUSTACHE_EXPR = seal(/\{\{[\w\W]*|[\w\W]*\}\}/gm); // Specify template detection regex for SAFE_FOR_TEMPLATES mode
    const ERB_EXPR = seal(/<%[\w\W]*|[\w\W]*%>/gm);
    const TMPLIT_EXPR = seal(/\$\{[\w\W]*/gm); // eslint-disable-line unicorn/better-regex
    const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/); // eslint-disable-line no-useless-escape
    const ARIA_ATTR = seal(/^aria-[\-\w]+$/); // eslint-disable-line no-useless-escape
    const IS_ALLOWED_URI = seal(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i // eslint-disable-line no-useless-escape
    );
    const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
    const ATTR_WHITESPACE = seal(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g // eslint-disable-line no-control-regex
    );
    const DOCTYPE_NAME = seal(/^html$/i);
    const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);

    var EXPRESSIONS = /*#__PURE__*/Object.freeze({
      __proto__: null,
      ARIA_ATTR: ARIA_ATTR,
      ATTR_WHITESPACE: ATTR_WHITESPACE,
      CUSTOM_ELEMENT: CUSTOM_ELEMENT,
      DATA_ATTR: DATA_ATTR,
      DOCTYPE_NAME: DOCTYPE_NAME,
      ERB_EXPR: ERB_EXPR,
      IS_ALLOWED_URI: IS_ALLOWED_URI,
      IS_SCRIPT_OR_DATA: IS_SCRIPT_OR_DATA,
      MUSTACHE_EXPR: MUSTACHE_EXPR,
      TMPLIT_EXPR: TMPLIT_EXPR
    });

    /* eslint-disable @typescript-eslint/indent */
    // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
    const NODE_TYPE = {
      element: 1,
      text: 3,
      // Deprecated
      progressingInstruction: 7,
      comment: 8,
      document: 9};
    const getGlobal = function getGlobal() {
      return typeof window === 'undefined' ? null : window;
    };
    /**
     * Creates a no-op policy for internal use only.
     * Don't export this function outside this module!
     * @param trustedTypes The policy factory.
     * @param purifyHostElement The Script element used to load DOMPurify (to determine policy name suffix).
     * @return The policy created (or null, if Trusted Types
     * are not supported or creating the policy failed).
     */
    const _createTrustedTypesPolicy = function _createTrustedTypesPolicy(trustedTypes, purifyHostElement) {
      if (typeof trustedTypes !== 'object' || typeof trustedTypes.createPolicy !== 'function') {
        return null;
      }
      // Allow the callers to control the unique policy name
      // by adding a data-tt-policy-suffix to the script element with the DOMPurify.
      // Policy creation with duplicate names throws in Trusted Types.
      let suffix = null;
      const ATTR_NAME = 'data-tt-policy-suffix';
      if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
        suffix = purifyHostElement.getAttribute(ATTR_NAME);
      }
      const policyName = 'dompurify' + (suffix ? '#' + suffix : '');
      try {
        return trustedTypes.createPolicy(policyName, {
          createHTML(html) {
            return html;
          },
          createScriptURL(scriptUrl) {
            return scriptUrl;
          }
        });
      } catch (_) {
        // Policy creation failed (most likely another DOMPurify script has
        // already run). Skip creating the policy, as this will only cause errors
        // if TT are enforced.
        console.warn('TrustedTypes policy ' + policyName + ' could not be created.');
        return null;
      }
    };
    const _createHooksMap = function _createHooksMap() {
      return {
        afterSanitizeAttributes: [],
        afterSanitizeElements: [],
        afterSanitizeShadowDOM: [],
        beforeSanitizeAttributes: [],
        beforeSanitizeElements: [],
        beforeSanitizeShadowDOM: [],
        uponSanitizeAttribute: [],
        uponSanitizeElement: [],
        uponSanitizeShadowNode: []
      };
    };
    function createDOMPurify() {
      let window = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : getGlobal();
      const DOMPurify = root => createDOMPurify(root);
      DOMPurify.version = '3.3.1';
      DOMPurify.removed = [];
      if (!window || !window.document || window.document.nodeType !== NODE_TYPE.document || !window.Element) {
        // Not running in a browser, provide a factory function
        // so that you can pass your own Window
        DOMPurify.isSupported = false;
        return DOMPurify;
      }
      let {
        document
      } = window;
      const originalDocument = document;
      const currentScript = originalDocument.currentScript;
      const {
        DocumentFragment,
        HTMLTemplateElement,
        Node,
        Element,
        NodeFilter,
        NamedNodeMap = window.NamedNodeMap || window.MozNamedAttrMap,
        HTMLFormElement,
        DOMParser,
        trustedTypes
      } = window;
      const ElementPrototype = Element.prototype;
      const cloneNode = lookupGetter(ElementPrototype, 'cloneNode');
      const remove = lookupGetter(ElementPrototype, 'remove');
      const getNextSibling = lookupGetter(ElementPrototype, 'nextSibling');
      const getChildNodes = lookupGetter(ElementPrototype, 'childNodes');
      const getParentNode = lookupGetter(ElementPrototype, 'parentNode');
      // As per issue #47, the web-components registry is inherited by a
      // new document created via createHTMLDocument. As per the spec
      // (http://w3c.github.io/webcomponents/spec/custom/#creating-and-passing-registries)
      // a new empty registry is used when creating a template contents owner
      // document, so we use that as our parent document to ensure nothing
      // is inherited.
      if (typeof HTMLTemplateElement === 'function') {
        const template = document.createElement('template');
        if (template.content && template.content.ownerDocument) {
          document = template.content.ownerDocument;
        }
      }
      let trustedTypesPolicy;
      let emptyHTML = '';
      const {
        implementation,
        createNodeIterator,
        createDocumentFragment,
        getElementsByTagName
      } = document;
      const {
        importNode
      } = originalDocument;
      let hooks = _createHooksMap();
      /**
       * Expose whether this browser supports running the full DOMPurify.
       */
      DOMPurify.isSupported = typeof entries === 'function' && typeof getParentNode === 'function' && implementation && implementation.createHTMLDocument !== undefined;
      const {
        MUSTACHE_EXPR,
        ERB_EXPR,
        TMPLIT_EXPR,
        DATA_ATTR,
        ARIA_ATTR,
        IS_SCRIPT_OR_DATA,
        ATTR_WHITESPACE,
        CUSTOM_ELEMENT
      } = EXPRESSIONS;
      let {
        IS_ALLOWED_URI: IS_ALLOWED_URI$1
      } = EXPRESSIONS;
      /**
       * We consider the elements and attributes below to be safe. Ideally
       * don't add any new ones but feel free to remove unwanted ones.
       */
      /* allowed element names */
      let ALLOWED_TAGS = null;
      const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...text]);
      /* Allowed attribute names */
      let ALLOWED_ATTR = null;
      const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
      /*
       * Configure how DOMPurify should handle custom elements and their attributes as well as customized built-in elements.
       * @property {RegExp|Function|null} tagNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any custom elements)
       * @property {RegExp|Function|null} attributeNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any attributes not on the allow list)
       * @property {boolean} allowCustomizedBuiltInElements allow custom elements derived from built-ins if they pass CUSTOM_ELEMENT_HANDLING.tagNameCheck. Default: `false`.
       */
      let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
        tagNameCheck: {
          writable: true,
          configurable: false,
          enumerable: true,
          value: null
        },
        attributeNameCheck: {
          writable: true,
          configurable: false,
          enumerable: true,
          value: null
        },
        allowCustomizedBuiltInElements: {
          writable: true,
          configurable: false,
          enumerable: true,
          value: false
        }
      }));
      /* Explicitly forbidden tags (overrides ALLOWED_TAGS/ADD_TAGS) */
      let FORBID_TAGS = null;
      /* Explicitly forbidden attributes (overrides ALLOWED_ATTR/ADD_ATTR) */
      let FORBID_ATTR = null;
      /* Config object to store ADD_TAGS/ADD_ATTR functions (when used as functions) */
      const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
        tagCheck: {
          writable: true,
          configurable: false,
          enumerable: true,
          value: null
        },
        attributeCheck: {
          writable: true,
          configurable: false,
          enumerable: true,
          value: null
        }
      }));
      /* Decide if ARIA attributes are okay */
      let ALLOW_ARIA_ATTR = true;
      /* Decide if custom data attributes are okay */
      let ALLOW_DATA_ATTR = true;
      /* Decide if unknown protocols are okay */
      let ALLOW_UNKNOWN_PROTOCOLS = false;
      /* Decide if self-closing tags in attributes are allowed.
       * Usually removed due to a mXSS issue in jQuery 3.0 */
      let ALLOW_SELF_CLOSE_IN_ATTR = true;
      /* Output should be safe for common template engines.
       * This means, DOMPurify removes data attributes, mustaches and ERB
       */
      let SAFE_FOR_TEMPLATES = false;
      /* Output should be safe even for XML used within HTML and alike.
       * This means, DOMPurify removes comments when containing risky content.
       */
      let SAFE_FOR_XML = true;
      /* Decide if document with <html>... should be returned */
      let WHOLE_DOCUMENT = false;
      /* Track whether config is already set on this instance of DOMPurify. */
      let SET_CONFIG = false;
      /* Decide if all elements (e.g. style, script) must be children of
       * document.body. By default, browsers might move them to document.head */
      let FORCE_BODY = false;
      /* Decide if a DOM `HTMLBodyElement` should be returned, instead of a html
       * string (or a TrustedHTML object if Trusted Types are supported).
       * If `WHOLE_DOCUMENT` is enabled a `HTMLHtmlElement` will be returned instead
       */
      let RETURN_DOM = false;
      /* Decide if a DOM `DocumentFragment` should be returned, instead of a html
       * string  (or a TrustedHTML object if Trusted Types are supported) */
      let RETURN_DOM_FRAGMENT = false;
      /* Try to return a Trusted Type object instead of a string, return a string in
       * case Trusted Types are not supported  */
      let RETURN_TRUSTED_TYPE = false;
      /* Output should be free from DOM clobbering attacks?
       * This sanitizes markups named with colliding, clobberable built-in DOM APIs.
       */
      let SANITIZE_DOM = true;
      /* Achieve full DOM Clobbering protection by isolating the namespace of named
       * properties and JS variables, mitigating attacks that abuse the HTML/DOM spec rules.
       *
       * HTML/DOM spec rules that enable DOM Clobbering:
       *   - Named Access on Window (§7.3.3)
       *   - DOM Tree Accessors (§3.1.5)
       *   - Form Element Parent-Child Relations (§4.10.3)
       *   - Iframe srcdoc / Nested WindowProxies (§4.8.5)
       *   - HTMLCollection (§4.2.10.2)
       *
       * Namespace isolation is implemented by prefixing `id` and `name` attributes
       * with a constant string, i.e., `user-content-`
       */
      let SANITIZE_NAMED_PROPS = false;
      const SANITIZE_NAMED_PROPS_PREFIX = 'user-content-';
      /* Keep element content when removing element? */
      let KEEP_CONTENT = true;
      /* If a `Node` is passed to sanitize(), then performs sanitization in-place instead
       * of importing it into a new Document and returning a sanitized copy */
      let IN_PLACE = false;
      /* Allow usage of profiles like html, svg and mathMl */
      let USE_PROFILES = {};
      /* Tags to ignore content of when KEEP_CONTENT is true */
      let FORBID_CONTENTS = null;
      const DEFAULT_FORBID_CONTENTS = addToSet({}, ['annotation-xml', 'audio', 'colgroup', 'desc', 'foreignobject', 'head', 'iframe', 'math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'noembed', 'noframes', 'noscript', 'plaintext', 'script', 'style', 'svg', 'template', 'thead', 'title', 'video', 'xmp']);
      /* Tags that are safe for data: URIs */
      let DATA_URI_TAGS = null;
      const DEFAULT_DATA_URI_TAGS = addToSet({}, ['audio', 'video', 'img', 'source', 'image', 'track']);
      /* Attributes safe for values like "javascript:" */
      let URI_SAFE_ATTRIBUTES = null;
      const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ['alt', 'class', 'for', 'id', 'label', 'name', 'pattern', 'placeholder', 'role', 'summary', 'title', 'value', 'style', 'xmlns']);
      const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
      const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
      const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
      /* Document namespace */
      let NAMESPACE = HTML_NAMESPACE;
      let IS_EMPTY_INPUT = false;
      /* Allowed XHTML+XML namespaces */
      let ALLOWED_NAMESPACES = null;
      const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
      let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, ['mi', 'mo', 'mn', 'ms', 'mtext']);
      let HTML_INTEGRATION_POINTS = addToSet({}, ['annotation-xml']);
      // Certain elements are allowed in both SVG and HTML
      // namespace. We need to specify them explicitly
      // so that they don't get erroneously deleted from
      // HTML namespace.
      const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ['title', 'style', 'font', 'a', 'script']);
      /* Parsing of strict XHTML documents */
      let PARSER_MEDIA_TYPE = null;
      const SUPPORTED_PARSER_MEDIA_TYPES = ['application/xhtml+xml', 'text/html'];
      const DEFAULT_PARSER_MEDIA_TYPE = 'text/html';
      let transformCaseFunc = null;
      /* Keep a reference to config to pass to hooks */
      let CONFIG = null;
      /* Ideally, do not touch anything below this line */
      /* ______________________________________________ */
      const formElement = document.createElement('form');
      const isRegexOrFunction = function isRegexOrFunction(testValue) {
        return testValue instanceof RegExp || testValue instanceof Function;
      };
      /**
       * _parseConfig
       *
       * @param cfg optional config literal
       */
      // eslint-disable-next-line complexity
      const _parseConfig = function _parseConfig() {
        let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        if (CONFIG && CONFIG === cfg) {
          return;
        }
        /* Shield configuration object from tampering */
        if (!cfg || typeof cfg !== 'object') {
          cfg = {};
        }
        /* Shield configuration object from prototype pollution */
        cfg = clone(cfg);
        PARSER_MEDIA_TYPE =
        // eslint-disable-next-line unicorn/prefer-includes
        SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
        // HTML tags and attributes are not case-sensitive, converting to lowercase. Keeping XHTML as is.
        transformCaseFunc = PARSER_MEDIA_TYPE === 'application/xhtml+xml' ? stringToString : stringToLowerCase;
        /* Set configuration parameters */
        ALLOWED_TAGS = objectHasOwnProperty(cfg, 'ALLOWED_TAGS') ? addToSet({}, cfg.ALLOWED_TAGS, transformCaseFunc) : DEFAULT_ALLOWED_TAGS;
        ALLOWED_ATTR = objectHasOwnProperty(cfg, 'ALLOWED_ATTR') ? addToSet({}, cfg.ALLOWED_ATTR, transformCaseFunc) : DEFAULT_ALLOWED_ATTR;
        ALLOWED_NAMESPACES = objectHasOwnProperty(cfg, 'ALLOWED_NAMESPACES') ? addToSet({}, cfg.ALLOWED_NAMESPACES, stringToString) : DEFAULT_ALLOWED_NAMESPACES;
        URI_SAFE_ATTRIBUTES = objectHasOwnProperty(cfg, 'ADD_URI_SAFE_ATTR') ? addToSet(clone(DEFAULT_URI_SAFE_ATTRIBUTES), cfg.ADD_URI_SAFE_ATTR, transformCaseFunc) : DEFAULT_URI_SAFE_ATTRIBUTES;
        DATA_URI_TAGS = objectHasOwnProperty(cfg, 'ADD_DATA_URI_TAGS') ? addToSet(clone(DEFAULT_DATA_URI_TAGS), cfg.ADD_DATA_URI_TAGS, transformCaseFunc) : DEFAULT_DATA_URI_TAGS;
        FORBID_CONTENTS = objectHasOwnProperty(cfg, 'FORBID_CONTENTS') ? addToSet({}, cfg.FORBID_CONTENTS, transformCaseFunc) : DEFAULT_FORBID_CONTENTS;
        FORBID_TAGS = objectHasOwnProperty(cfg, 'FORBID_TAGS') ? addToSet({}, cfg.FORBID_TAGS, transformCaseFunc) : clone({});
        FORBID_ATTR = objectHasOwnProperty(cfg, 'FORBID_ATTR') ? addToSet({}, cfg.FORBID_ATTR, transformCaseFunc) : clone({});
        USE_PROFILES = objectHasOwnProperty(cfg, 'USE_PROFILES') ? cfg.USE_PROFILES : false;
        ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false; // Default true
        ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false; // Default true
        ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false; // Default false
        ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false; // Default true
        SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false; // Default false
        SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false; // Default true
        WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false; // Default false
        RETURN_DOM = cfg.RETURN_DOM || false; // Default false
        RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false; // Default false
        RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false; // Default false
        FORCE_BODY = cfg.FORCE_BODY || false; // Default false
        SANITIZE_DOM = cfg.SANITIZE_DOM !== false; // Default true
        SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false; // Default false
        KEEP_CONTENT = cfg.KEEP_CONTENT !== false; // Default true
        IN_PLACE = cfg.IN_PLACE || false; // Default false
        IS_ALLOWED_URI$1 = cfg.ALLOWED_URI_REGEXP || IS_ALLOWED_URI;
        NAMESPACE = cfg.NAMESPACE || HTML_NAMESPACE;
        MATHML_TEXT_INTEGRATION_POINTS = cfg.MATHML_TEXT_INTEGRATION_POINTS || MATHML_TEXT_INTEGRATION_POINTS;
        HTML_INTEGRATION_POINTS = cfg.HTML_INTEGRATION_POINTS || HTML_INTEGRATION_POINTS;
        CUSTOM_ELEMENT_HANDLING = cfg.CUSTOM_ELEMENT_HANDLING || {};
        if (cfg.CUSTOM_ELEMENT_HANDLING && isRegexOrFunction(cfg.CUSTOM_ELEMENT_HANDLING.tagNameCheck)) {
          CUSTOM_ELEMENT_HANDLING.tagNameCheck = cfg.CUSTOM_ELEMENT_HANDLING.tagNameCheck;
        }
        if (cfg.CUSTOM_ELEMENT_HANDLING && isRegexOrFunction(cfg.CUSTOM_ELEMENT_HANDLING.attributeNameCheck)) {
          CUSTOM_ELEMENT_HANDLING.attributeNameCheck = cfg.CUSTOM_ELEMENT_HANDLING.attributeNameCheck;
        }
        if (cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements === 'boolean') {
          CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = cfg.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements;
        }
        if (SAFE_FOR_TEMPLATES) {
          ALLOW_DATA_ATTR = false;
        }
        if (RETURN_DOM_FRAGMENT) {
          RETURN_DOM = true;
        }
        /* Parse profile info */
        if (USE_PROFILES) {
          ALLOWED_TAGS = addToSet({}, text);
          ALLOWED_ATTR = [];
          if (USE_PROFILES.html === true) {
            addToSet(ALLOWED_TAGS, html$1);
            addToSet(ALLOWED_ATTR, html);
          }
          if (USE_PROFILES.svg === true) {
            addToSet(ALLOWED_TAGS, svg$1);
            addToSet(ALLOWED_ATTR, svg);
            addToSet(ALLOWED_ATTR, xml);
          }
          if (USE_PROFILES.svgFilters === true) {
            addToSet(ALLOWED_TAGS, svgFilters);
            addToSet(ALLOWED_ATTR, svg);
            addToSet(ALLOWED_ATTR, xml);
          }
          if (USE_PROFILES.mathMl === true) {
            addToSet(ALLOWED_TAGS, mathMl$1);
            addToSet(ALLOWED_ATTR, mathMl);
            addToSet(ALLOWED_ATTR, xml);
          }
        }
        /* Merge configuration parameters */
        if (cfg.ADD_TAGS) {
          if (typeof cfg.ADD_TAGS === 'function') {
            EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
          } else {
            if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
              ALLOWED_TAGS = clone(ALLOWED_TAGS);
            }
            addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
          }
        }
        if (cfg.ADD_ATTR) {
          if (typeof cfg.ADD_ATTR === 'function') {
            EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
          } else {
            if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
              ALLOWED_ATTR = clone(ALLOWED_ATTR);
            }
            addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
          }
        }
        if (cfg.ADD_URI_SAFE_ATTR) {
          addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
        }
        if (cfg.FORBID_CONTENTS) {
          if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
            FORBID_CONTENTS = clone(FORBID_CONTENTS);
          }
          addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
        }
        if (cfg.ADD_FORBID_CONTENTS) {
          if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
            FORBID_CONTENTS = clone(FORBID_CONTENTS);
          }
          addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
        }
        /* Add #text in case KEEP_CONTENT is set to true */
        if (KEEP_CONTENT) {
          ALLOWED_TAGS['#text'] = true;
        }
        /* Add html, head and body to ALLOWED_TAGS in case WHOLE_DOCUMENT is true */
        if (WHOLE_DOCUMENT) {
          addToSet(ALLOWED_TAGS, ['html', 'head', 'body']);
        }
        /* Add tbody to ALLOWED_TAGS in case tables are permitted, see #286, #365 */
        if (ALLOWED_TAGS.table) {
          addToSet(ALLOWED_TAGS, ['tbody']);
          delete FORBID_TAGS.tbody;
        }
        if (cfg.TRUSTED_TYPES_POLICY) {
          if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== 'function') {
            throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
          }
          if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== 'function') {
            throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
          }
          // Overwrite existing TrustedTypes policy.
          trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
          // Sign local variables required by `sanitize`.
          emptyHTML = trustedTypesPolicy.createHTML('');
        } else {
          // Uninitialized policy, attempt to initialize the internal dompurify policy.
          if (trustedTypesPolicy === undefined) {
            trustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
          }
          // If creating the internal policy succeeded sign internal variables.
          if (trustedTypesPolicy !== null && typeof emptyHTML === 'string') {
            emptyHTML = trustedTypesPolicy.createHTML('');
          }
        }
        // Prevent further manipulation of configuration.
        // Not available in IE8, Safari 5, etc.
        if (freeze) {
          freeze(cfg);
        }
        CONFIG = cfg;
      };
      /* Keep track of all possible SVG and MathML tags
       * so that we can perform the namespace checks
       * correctly. */
      const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
      const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
      /**
       * @param element a DOM element whose namespace is being checked
       * @returns Return false if the element has a
       *  namespace that a spec-compliant parser would never
       *  return. Return true otherwise.
       */
      const _checkValidNamespace = function _checkValidNamespace(element) {
        let parent = getParentNode(element);
        // In JSDOM, if we're inside shadow DOM, then parentNode
        // can be null. We just simulate parent in this case.
        if (!parent || !parent.tagName) {
          parent = {
            namespaceURI: NAMESPACE,
            tagName: 'template'
          };
        }
        const tagName = stringToLowerCase(element.tagName);
        const parentTagName = stringToLowerCase(parent.tagName);
        if (!ALLOWED_NAMESPACES[element.namespaceURI]) {
          return false;
        }
        if (element.namespaceURI === SVG_NAMESPACE) {
          // The only way to switch from HTML namespace to SVG
          // is via <svg>. If it happens via any other tag, then
          // it should be killed.
          if (parent.namespaceURI === HTML_NAMESPACE) {
            return tagName === 'svg';
          }
          // The only way to switch from MathML to SVG is via`
          // svg if parent is either <annotation-xml> or MathML
          // text integration points.
          if (parent.namespaceURI === MATHML_NAMESPACE) {
            return tagName === 'svg' && (parentTagName === 'annotation-xml' || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
          }
          // We only allow elements that are defined in SVG
          // spec. All others are disallowed in SVG namespace.
          return Boolean(ALL_SVG_TAGS[tagName]);
        }
        if (element.namespaceURI === MATHML_NAMESPACE) {
          // The only way to switch from HTML namespace to MathML
          // is via <math>. If it happens via any other tag, then
          // it should be killed.
          if (parent.namespaceURI === HTML_NAMESPACE) {
            return tagName === 'math';
          }
          // The only way to switch from SVG to MathML is via
          // <math> and HTML integration points
          if (parent.namespaceURI === SVG_NAMESPACE) {
            return tagName === 'math' && HTML_INTEGRATION_POINTS[parentTagName];
          }
          // We only allow elements that are defined in MathML
          // spec. All others are disallowed in MathML namespace.
          return Boolean(ALL_MATHML_TAGS[tagName]);
        }
        if (element.namespaceURI === HTML_NAMESPACE) {
          // The only way to switch from SVG to HTML is via
          // HTML integration points, and from MathML to HTML
          // is via MathML text integration points
          if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
            return false;
          }
          if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
            return false;
          }
          // We disallow tags that are specific for MathML
          // or SVG and should never appear in HTML namespace
          return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
        }
        // For XHTML and XML documents that support custom namespaces
        if (PARSER_MEDIA_TYPE === 'application/xhtml+xml' && ALLOWED_NAMESPACES[element.namespaceURI]) {
          return true;
        }
        // The code should never reach this place (this means
        // that the element somehow got namespace that is not
        // HTML, SVG, MathML or allowed via ALLOWED_NAMESPACES).
        // Return false just in case.
        return false;
      };
      /**
       * _forceRemove
       *
       * @param node a DOM node
       */
      const _forceRemove = function _forceRemove(node) {
        arrayPush(DOMPurify.removed, {
          element: node
        });
        try {
          // eslint-disable-next-line unicorn/prefer-dom-node-remove
          getParentNode(node).removeChild(node);
        } catch (_) {
          remove(node);
        }
      };
      /**
       * _removeAttribute
       *
       * @param name an Attribute name
       * @param element a DOM node
       */
      const _removeAttribute = function _removeAttribute(name, element) {
        try {
          arrayPush(DOMPurify.removed, {
            attribute: element.getAttributeNode(name),
            from: element
          });
        } catch (_) {
          arrayPush(DOMPurify.removed, {
            attribute: null,
            from: element
          });
        }
        element.removeAttribute(name);
        // We void attribute values for unremovable "is" attributes
        if (name === 'is') {
          if (RETURN_DOM || RETURN_DOM_FRAGMENT) {
            try {
              _forceRemove(element);
            } catch (_) {}
          } else {
            try {
              element.setAttribute(name, '');
            } catch (_) {}
          }
        }
      };
      /**
       * _initDocument
       *
       * @param dirty - a string of dirty markup
       * @return a DOM, filled with the dirty markup
       */
      const _initDocument = function _initDocument(dirty) {
        /* Create a HTML document */
        let doc = null;
        let leadingWhitespace = null;
        if (FORCE_BODY) {
          dirty = '<remove></remove>' + dirty;
        } else {
          /* If FORCE_BODY isn't used, leading whitespace needs to be preserved manually */
          const matches = stringMatch(dirty, /^[\r\n\t ]+/);
          leadingWhitespace = matches && matches[0];
        }
        if (PARSER_MEDIA_TYPE === 'application/xhtml+xml' && NAMESPACE === HTML_NAMESPACE) {
          // Root of XHTML doc must contain xmlns declaration (see https://www.w3.org/TR/xhtml1/normative.html#strict)
          dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + '</body></html>';
        }
        const dirtyPayload = trustedTypesPolicy ? trustedTypesPolicy.createHTML(dirty) : dirty;
        /*
         * Use the DOMParser API by default, fallback later if needs be
         * DOMParser not work for svg when has multiple root element.
         */
        if (NAMESPACE === HTML_NAMESPACE) {
          try {
            doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
          } catch (_) {}
        }
        /* Use createHTMLDocument in case DOMParser is not available */
        if (!doc || !doc.documentElement) {
          doc = implementation.createDocument(NAMESPACE, 'template', null);
          try {
            doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
          } catch (_) {
            // Syntax error if dirtyPayload is invalid xml
          }
        }
        const body = doc.body || doc.documentElement;
        if (dirty && leadingWhitespace) {
          body.insertBefore(document.createTextNode(leadingWhitespace), body.childNodes[0] || null);
        }
        /* Work on whole document or just its body */
        if (NAMESPACE === HTML_NAMESPACE) {
          return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? 'html' : 'body')[0];
        }
        return WHOLE_DOCUMENT ? doc.documentElement : body;
      };
      /**
       * Creates a NodeIterator object that you can use to traverse filtered lists of nodes or elements in a document.
       *
       * @param root The root element or node to start traversing on.
       * @return The created NodeIterator
       */
      const _createNodeIterator = function _createNodeIterator(root) {
        return createNodeIterator.call(root.ownerDocument || root, root,
        // eslint-disable-next-line no-bitwise
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION, null);
      };
      /**
       * _isClobbered
       *
       * @param element element to check for clobbering attacks
       * @return true if clobbered, false if safe
       */
      const _isClobbered = function _isClobbered(element) {
        return element instanceof HTMLFormElement && (typeof element.nodeName !== 'string' || typeof element.textContent !== 'string' || typeof element.removeChild !== 'function' || !(element.attributes instanceof NamedNodeMap) || typeof element.removeAttribute !== 'function' || typeof element.setAttribute !== 'function' || typeof element.namespaceURI !== 'string' || typeof element.insertBefore !== 'function' || typeof element.hasChildNodes !== 'function');
      };
      /**
       * Checks whether the given object is a DOM node.
       *
       * @param value object to check whether it's a DOM node
       * @return true is object is a DOM node
       */
      const _isNode = function _isNode(value) {
        return typeof Node === 'function' && value instanceof Node;
      };
      function _executeHooks(hooks, currentNode, data) {
        arrayForEach(hooks, hook => {
          hook.call(DOMPurify, currentNode, data, CONFIG);
        });
      }
      /**
       * _sanitizeElements
       *
       * @protect nodeName
       * @protect textContent
       * @protect removeChild
       * @param currentNode to check for permission to exist
       * @return true if node was killed, false if left alive
       */
      const _sanitizeElements = function _sanitizeElements(currentNode) {
        let content = null;
        /* Execute a hook if present */
        _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
        /* Check if element is clobbered or can clobber */
        if (_isClobbered(currentNode)) {
          _forceRemove(currentNode);
          return true;
        }
        /* Now let's check the element's type and name */
        const tagName = transformCaseFunc(currentNode.nodeName);
        /* Execute a hook if present */
        _executeHooks(hooks.uponSanitizeElement, currentNode, {
          tagName,
          allowedTags: ALLOWED_TAGS
        });
        /* Detect mXSS attempts abusing namespace confusion */
        if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(/<[/\w!]/g, currentNode.innerHTML) && regExpTest(/<[/\w!]/g, currentNode.textContent)) {
          _forceRemove(currentNode);
          return true;
        }
        /* Remove any occurrence of processing instructions */
        if (currentNode.nodeType === NODE_TYPE.progressingInstruction) {
          _forceRemove(currentNode);
          return true;
        }
        /* Remove any kind of possibly harmful comments */
        if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(/<[/\w]/g, currentNode.data)) {
          _forceRemove(currentNode);
          return true;
        }
        /* Remove element if anything forbids its presence */
        if (!(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName])) {
          /* Check if we have a custom element to handle */
          if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
            if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
              return false;
            }
            if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) {
              return false;
            }
          }
          /* Keep content except for bad-listed elements */
          if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
            const parentNode = getParentNode(currentNode) || currentNode.parentNode;
            const childNodes = getChildNodes(currentNode) || currentNode.childNodes;
            if (childNodes && parentNode) {
              const childCount = childNodes.length;
              for (let i = childCount - 1; i >= 0; --i) {
                const childClone = cloneNode(childNodes[i], true);
                childClone.__removalCount = (currentNode.__removalCount || 0) + 1;
                parentNode.insertBefore(childClone, getNextSibling(currentNode));
              }
            }
          }
          _forceRemove(currentNode);
          return true;
        }
        /* Check whether element has a valid namespace */
        if (currentNode instanceof Element && !_checkValidNamespace(currentNode)) {
          _forceRemove(currentNode);
          return true;
        }
        /* Make sure that older browsers don't get fallback-tag mXSS */
        if ((tagName === 'noscript' || tagName === 'noembed' || tagName === 'noframes') && regExpTest(/<\/no(script|embed|frames)/i, currentNode.innerHTML)) {
          _forceRemove(currentNode);
          return true;
        }
        /* Sanitize element content to be template-safe */
        if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
          /* Get the element's text content */
          content = currentNode.textContent;
          arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
            content = stringReplace(content, expr, ' ');
          });
          if (currentNode.textContent !== content) {
            arrayPush(DOMPurify.removed, {
              element: currentNode.cloneNode()
            });
            currentNode.textContent = content;
          }
        }
        /* Execute a hook if present */
        _executeHooks(hooks.afterSanitizeElements, currentNode, null);
        return false;
      };
      /**
       * _isValidAttribute
       *
       * @param lcTag Lowercase tag name of containing element.
       * @param lcName Lowercase attribute name.
       * @param value Attribute value.
       * @return Returns true if `value` is valid, otherwise false.
       */
      // eslint-disable-next-line complexity
      const _isValidAttribute = function _isValidAttribute(lcTag, lcName, value) {
        /* Make sure attribute cannot clobber */
        if (SANITIZE_DOM && (lcName === 'id' || lcName === 'name') && (value in document || value in formElement)) {
          return false;
        }
        /* Allow valid data-* attributes: At least one character after "-"
            (https://html.spec.whatwg.org/multipage/dom.html#embedding-custom-non-visible-data-with-the-data-*-attributes)
            XML-compatible (https://html.spec.whatwg.org/multipage/infrastructure.html#xml-compatible and http://www.w3.org/TR/xml/#d0e804)
            We don't need to check the value; it's always URI safe. */
        if (ALLOW_DATA_ATTR && !FORBID_ATTR[lcName] && regExpTest(DATA_ATTR, lcName)) ; else if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR, lcName)) ; else if (EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag)) ; else if (!ALLOWED_ATTR[lcName] || FORBID_ATTR[lcName]) {
          if (
          // First condition does a very basic check if a) it's basically a valid custom element tagname AND
          // b) if the tagName passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
          // and c) if the attribute name passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.attributeNameCheck
          _isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName, lcTag)) ||
          // Alternative, second condition checks if it's an `is`-attribute, AND
          // the value passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
          lcName === 'is' && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value))) ; else {
            return false;
          }
          /* Check value is safe. First, is attr inert? If so, is safe */
        } else if (URI_SAFE_ATTRIBUTES[lcName]) ; else if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE, ''))) ; else if ((lcName === 'src' || lcName === 'xlink:href' || lcName === 'href') && lcTag !== 'script' && stringIndexOf(value, 'data:') === 0 && DATA_URI_TAGS[lcTag]) ; else if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA, stringReplace(value, ATTR_WHITESPACE, ''))) ; else if (value) {
          return false;
        } else ;
        return true;
      };
      /**
       * _isBasicCustomElement
       * checks if at least one dash is included in tagName, and it's not the first char
       * for more sophisticated checking see https://github.com/sindresorhus/validate-element-name
       *
       * @param tagName name of the tag of the node to sanitize
       * @returns Returns true if the tag name meets the basic criteria for a custom element, otherwise false.
       */
      const _isBasicCustomElement = function _isBasicCustomElement(tagName) {
        return tagName !== 'annotation-xml' && stringMatch(tagName, CUSTOM_ELEMENT);
      };
      /**
       * _sanitizeAttributes
       *
       * @protect attributes
       * @protect nodeName
       * @protect removeAttribute
       * @protect setAttribute
       *
       * @param currentNode to sanitize
       */
      const _sanitizeAttributes = function _sanitizeAttributes(currentNode) {
        /* Execute a hook if present */
        _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
        const {
          attributes
        } = currentNode;
        /* Check if we have attributes; if not we might have a text node */
        if (!attributes || _isClobbered(currentNode)) {
          return;
        }
        const hookEvent = {
          attrName: '',
          attrValue: '',
          keepAttr: true,
          allowedAttributes: ALLOWED_ATTR,
          forceKeepAttr: undefined
        };
        let l = attributes.length;
        /* Go backwards over all attributes; safely remove bad ones */
        while (l--) {
          const attr = attributes[l];
          const {
            name,
            namespaceURI,
            value: attrValue
          } = attr;
          const lcName = transformCaseFunc(name);
          const initValue = attrValue;
          let value = name === 'value' ? initValue : stringTrim(initValue);
          /* Execute a hook if present */
          hookEvent.attrName = lcName;
          hookEvent.attrValue = value;
          hookEvent.keepAttr = true;
          hookEvent.forceKeepAttr = undefined; // Allows developers to see this is a property they can set
          _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
          value = hookEvent.attrValue;
          /* Full DOM Clobbering protection via namespace isolation,
           * Prefix id and name attributes with `user-content-`
           */
          if (SANITIZE_NAMED_PROPS && (lcName === 'id' || lcName === 'name')) {
            // Remove the attribute with this value
            _removeAttribute(name, currentNode);
            // Prefix the value and later re-create the attribute with the sanitized value
            value = SANITIZE_NAMED_PROPS_PREFIX + value;
          }
          /* Work around a security issue with comments inside attributes */
          if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|title|textarea)/i, value)) {
            _removeAttribute(name, currentNode);
            continue;
          }
          /* Make sure we cannot easily use animated hrefs, even if animations are allowed */
          if (lcName === 'attributename' && stringMatch(value, 'href')) {
            _removeAttribute(name, currentNode);
            continue;
          }
          /* Did the hooks approve of the attribute? */
          if (hookEvent.forceKeepAttr) {
            continue;
          }
          /* Did the hooks approve of the attribute? */
          if (!hookEvent.keepAttr) {
            _removeAttribute(name, currentNode);
            continue;
          }
          /* Work around a security issue in jQuery 3.0 */
          if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(/\/>/i, value)) {
            _removeAttribute(name, currentNode);
            continue;
          }
          /* Sanitize attribute content to be template-safe */
          if (SAFE_FOR_TEMPLATES) {
            arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
              value = stringReplace(value, expr, ' ');
            });
          }
          /* Is `value` valid for this attribute? */
          const lcTag = transformCaseFunc(currentNode.nodeName);
          if (!_isValidAttribute(lcTag, lcName, value)) {
            _removeAttribute(name, currentNode);
            continue;
          }
          /* Handle attributes that require Trusted Types */
          if (trustedTypesPolicy && typeof trustedTypes === 'object' && typeof trustedTypes.getAttributeType === 'function') {
            if (namespaceURI) ; else {
              switch (trustedTypes.getAttributeType(lcTag, lcName)) {
                case 'TrustedHTML':
                  {
                    value = trustedTypesPolicy.createHTML(value);
                    break;
                  }
                case 'TrustedScriptURL':
                  {
                    value = trustedTypesPolicy.createScriptURL(value);
                    break;
                  }
              }
            }
          }
          /* Handle invalid data-* attribute set by try-catching it */
          if (value !== initValue) {
            try {
              if (namespaceURI) {
                currentNode.setAttributeNS(namespaceURI, name, value);
              } else {
                /* Fallback to setAttribute() for browser-unrecognized namespaces e.g. "x-schema". */
                currentNode.setAttribute(name, value);
              }
              if (_isClobbered(currentNode)) {
                _forceRemove(currentNode);
              } else {
                arrayPop(DOMPurify.removed);
              }
            } catch (_) {
              _removeAttribute(name, currentNode);
            }
          }
        }
        /* Execute a hook if present */
        _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
      };
      /**
       * _sanitizeShadowDOM
       *
       * @param fragment to iterate over recursively
       */
      const _sanitizeShadowDOM = function _sanitizeShadowDOM(fragment) {
        let shadowNode = null;
        const shadowIterator = _createNodeIterator(fragment);
        /* Execute a hook if present */
        _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
        while (shadowNode = shadowIterator.nextNode()) {
          /* Execute a hook if present */
          _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
          /* Sanitize tags and elements */
          _sanitizeElements(shadowNode);
          /* Check attributes next */
          _sanitizeAttributes(shadowNode);
          /* Deep shadow DOM detected */
          if (shadowNode.content instanceof DocumentFragment) {
            _sanitizeShadowDOM(shadowNode.content);
          }
        }
        /* Execute a hook if present */
        _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
      };
      // eslint-disable-next-line complexity
      DOMPurify.sanitize = function (dirty) {
        let cfg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        let body = null;
        let importedNode = null;
        let currentNode = null;
        let returnNode = null;
        /* Make sure we have a string to sanitize.
          DO NOT return early, as this will return the wrong type if
          the user has requested a DOM object rather than a string */
        IS_EMPTY_INPUT = !dirty;
        if (IS_EMPTY_INPUT) {
          dirty = '<!-->';
        }
        /* Stringify, in case dirty is an object */
        if (typeof dirty !== 'string' && !_isNode(dirty)) {
          if (typeof dirty.toString === 'function') {
            dirty = dirty.toString();
            if (typeof dirty !== 'string') {
              throw typeErrorCreate('dirty is not a string, aborting');
            }
          } else {
            throw typeErrorCreate('toString is not a function');
          }
        }
        /* Return dirty HTML if DOMPurify cannot run */
        if (!DOMPurify.isSupported) {
          return dirty;
        }
        /* Assign config vars */
        if (!SET_CONFIG) {
          _parseConfig(cfg);
        }
        /* Clean up removed elements */
        DOMPurify.removed = [];
        /* Check if dirty is correctly typed for IN_PLACE */
        if (typeof dirty === 'string') {
          IN_PLACE = false;
        }
        if (IN_PLACE) {
          /* Do some early pre-sanitization to avoid unsafe root nodes */
          if (dirty.nodeName) {
            const tagName = transformCaseFunc(dirty.nodeName);
            if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
              throw typeErrorCreate('root node is forbidden and cannot be sanitized in-place');
            }
          }
        } else if (dirty instanceof Node) {
          /* If dirty is a DOM element, append to an empty document to avoid
             elements being stripped by the parser */
          body = _initDocument('<!---->');
          importedNode = body.ownerDocument.importNode(dirty, true);
          if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === 'BODY') {
            /* Node is already a body, use as is */
            body = importedNode;
          } else if (importedNode.nodeName === 'HTML') {
            body = importedNode;
          } else {
            // eslint-disable-next-line unicorn/prefer-dom-node-append
            body.appendChild(importedNode);
          }
        } else {
          /* Exit directly if we have nothing to do */
          if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT &&
          // eslint-disable-next-line unicorn/prefer-includes
          dirty.indexOf('<') === -1) {
            return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(dirty) : dirty;
          }
          /* Initialize the document to work on */
          body = _initDocument(dirty);
          /* Check we have a DOM node from the data */
          if (!body) {
            return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : '';
          }
        }
        /* Remove first element node (ours) if FORCE_BODY is set */
        if (body && FORCE_BODY) {
          _forceRemove(body.firstChild);
        }
        /* Get node iterator */
        const nodeIterator = _createNodeIterator(IN_PLACE ? dirty : body);
        /* Now start iterating over the created document */
        while (currentNode = nodeIterator.nextNode()) {
          /* Sanitize tags and elements */
          _sanitizeElements(currentNode);
          /* Check attributes next */
          _sanitizeAttributes(currentNode);
          /* Shadow DOM detected, sanitize it */
          if (currentNode.content instanceof DocumentFragment) {
            _sanitizeShadowDOM(currentNode.content);
          }
        }
        /* If we sanitized `dirty` in-place, return it. */
        if (IN_PLACE) {
          return dirty;
        }
        /* Return sanitized string or DOM */
        if (RETURN_DOM) {
          if (RETURN_DOM_FRAGMENT) {
            returnNode = createDocumentFragment.call(body.ownerDocument);
            while (body.firstChild) {
              // eslint-disable-next-line unicorn/prefer-dom-node-append
              returnNode.appendChild(body.firstChild);
            }
          } else {
            returnNode = body;
          }
          if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
            /*
              AdoptNode() is not used because internal state is not reset
              (e.g. the past names map of a HTMLFormElement), this is safe
              in theory but we would rather not risk another attack vector.
              The state that is cloned by importNode() is explicitly defined
              by the specs.
            */
            returnNode = importNode.call(originalDocument, returnNode, true);
          }
          return returnNode;
        }
        let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
        /* Serialize doctype if allowed */
        if (WHOLE_DOCUMENT && ALLOWED_TAGS['!doctype'] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
          serializedHTML = '<!DOCTYPE ' + body.ownerDocument.doctype.name + '>\n' + serializedHTML;
        }
        /* Sanitize final string template-safe */
        if (SAFE_FOR_TEMPLATES) {
          arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
            serializedHTML = stringReplace(serializedHTML, expr, ' ');
          });
        }
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(serializedHTML) : serializedHTML;
      };
      DOMPurify.setConfig = function () {
        let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        _parseConfig(cfg);
        SET_CONFIG = true;
      };
      DOMPurify.clearConfig = function () {
        CONFIG = null;
        SET_CONFIG = false;
      };
      DOMPurify.isValidAttribute = function (tag, attr, value) {
        /* Initialize shared config vars if necessary. */
        if (!CONFIG) {
          _parseConfig({});
        }
        const lcTag = transformCaseFunc(tag);
        const lcName = transformCaseFunc(attr);
        return _isValidAttribute(lcTag, lcName, value);
      };
      DOMPurify.addHook = function (entryPoint, hookFunction) {
        if (typeof hookFunction !== 'function') {
          return;
        }
        arrayPush(hooks[entryPoint], hookFunction);
      };
      DOMPurify.removeHook = function (entryPoint, hookFunction) {
        if (hookFunction !== undefined) {
          const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
          return index === -1 ? undefined : arraySplice(hooks[entryPoint], index, 1)[0];
        }
        return arrayPop(hooks[entryPoint]);
      };
      DOMPurify.removeHooks = function (entryPoint) {
        hooks[entryPoint] = [];
      };
      DOMPurify.removeAllHooks = function () {
        hooks = _createHooksMap();
      };
      return DOMPurify;
    }
    var purify = createDOMPurify();

    class TranslationUI {
        config;
        constructor(config) {
            this.config = config;
        }
        static domainConfig;
        get LangDropdown() {
            return document.getElementById("onlinetranslation-dropdown");
        }
        get LangDropdownContainer() {
            return document.getElementById("onlinetranslation-container");
        }
        prepareLanguageSelector(selected, supportedLangs) {
            if (supportedLangs == undefined)
                return "error";
            if (this.LangDropdownContainer != null) {
                if (this.config.Marionette || this.config.langOverride) {
                    console.log("Intentionally *not* making selector visible due to marionetting");
                }
            }
            else {
                console.log("Can't find the container for the language selector");
            }
            if (this.LangDropdown != null) {
                this.removeTWSPlaceholderOpt(this.LangDropdown);
                this.setLanguageOptionsInHASelector(supportedLangs, selected, this.LangDropdown);
            }
            else {
                console.log("Can't find the language selector in the page");
            }
            if (!(selected == "en" || supportedLangs.some((l) => l.value === selected))) {
                this.setErrorStateForLanguageSelector(true);
                console.log("Language selector prepared, but selected language not available ");
                return "error";
            }
            console.log("Language selector prepared");
            if (this.config.Marionette && this.LangDropdownContainer != null) {
                console.log("original style for container");
                console.log(this.LangDropdownContainer.style.display);
                this.LangDropdownContainer.style.display = "none";
                console.log("prepared style for container");
                console.log(this.LangDropdownContainer.style.display);
            }
            return "ok";
        }
        setLanguageSelectorVisibility(visible, cdnURL) {
            if (this.LangDropdownContainer != null) {
                console.log("old style for container before visibility set");
                console.log(this.LangDropdownContainer.style.display);
                console.log("setting visibility of the container to " + visible);
                if (visible === true) {
                    this.LangDropdownContainer.style.setProperty("display", "table", "important");
                    if (TranslationUI.domainConfig.OverwriteEmbeddedUi) {
                        this.updateUi(cdnURL);
                    }
                }
                else {
                    this.LangDropdownContainer.style.setProperty("display", "none", "important");
                }
                // this.LangDropdownContainer.style.display = visible ? "table !important" : "none !important";
                console.log("new style for container");
                console.log(this.LangDropdownContainer.style.display);
            }
        }
        removeTWSPlaceholderOpt(languageSelector) {
            console.log("Removing TWS placeholder");
            for (const child of languageSelector.children) {
                if (child.tagName == "OPTION" &&
                    child.innerHTML == "Language Unavailable") {
                    console.log("TWS placeholder found");
                    child.remove();
                }
            }
        }
        setLanguageOptionsInHASelector(options, selected, languageSelector) {
            // we need to iterate our languages and create a new select element for each option
            // in case this is being run multiple times, let's clear our selector first and restore it to the default state
            // That means putting just the English case in the selector
            const optGroupsToRemove = languageSelector.getElementsByTagName("optgroup");
            for (let i = optGroupsToRemove.length - 1; i >= 0; i--) {
                if (optGroupsToRemove[i].label != "Original") {
                    languageSelector.removeChild(optGroupsToRemove[i]);
                }
            }
            // In the HA code English is already provided but we just deleted it, so now we add it back
            // check if the user's chosen language is actually available
            // if not then we put that language into the array and show it as 'unavailable'
            // we don't do this if the language is English (because English doesn't come back in our array)
            let languageWasUnavailable = false;
            if (options.filter((l) => l.value === selected).length === 0 &&
                selected != "en") {
                // first create an 'unavailable' group
                const unavailableLanguageOptGroup = document.createElement("optgroup");
                unavailableLanguageOptGroup.label = "Unavailable";
                languageSelector.add(unavailableLanguageOptGroup);
                // now put the language into that group
                const unavailableLanguageOption = {
                    value: this.config.Language,
                    text: this.config.LanguageTranslated};
                const languageOption = document.createElement("option");
                languageOption.text = `(${unavailableLanguageOption.text}) - Unavailable`;
                languageOption.value = unavailableLanguageOption.value;
                languageOption.disabled = true;
                unavailableLanguageOptGroup.appendChild(languageOption);
                languageWasUnavailable = true;
            }
            // if the array of available languages has at least 1 language in it, then display a 'translated' options group
            if (options.length > 0) {
                const languageOptionGroup = document.createElement("optgroup");
                languageOptionGroup.label = "Translated";
                languageSelector.add(languageOptionGroup);
                // now iterate the options array and add an option for each available language
                for (let i = 0; i < options.length; i++) {
                    // console.log("generating language selection for option " + i);
                    const languageObject = options[i];
                    // generate an option object
                    const languageOption = document.createElement("option");
                    languageOption.text = `${languageObject.translated} (${languageObject.text})`;
                    languageOption.value = languageObject.value;
                    languageOptionGroup.appendChild(languageOption);
                    // if this is the selected language then also set the value of the displayed language at the bottom of the menu
                    // console.log("checking language value " + languageOption.value + " against selected " + selected);
                    if (languageOption.value == selected) {
                        // console.log("setting selected index of selector to " + languageOption.value);
                        languageSelector.selectedIndex = i + 1; // note that we add 1 as English is the default entry
                        // we also use this trigger to set the ltr / rtl direction attribute as we can't do this after the page reloads
                        this.setLanguageDirection(languageObject);
                    }
                }
            }
            // set the value of the displayed language in the menu if it is english
            // if not english we set it above
            if (selected == "en") {
                // console.log("setting selected index of selector to en");
                languageSelector.selectedIndex = 0;
            }
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const asyncThis = this;
            // now we want to override the select event so that we can get the events and change the language
            languageSelector.onchange = async function () {
                // console.log("language selector did change, new index: " + languageSelector.selectedIndex);
                // if the selected option is index 0 then it's always English
                if (languageSelector.selectedIndex == 0) {
                    const englishOption = {
                        value: "en",
                        text: "Original",
                        translated: "English",
                        direction: "ltr",
                        available: true,
                    };
                    await asyncThis.languageSet(englishOption);
                    location.reload();
                }
                else {
                    // if the language originally chosen was unavailable then we need to take 2 off our selectedIndex to account for the unavaiable one that we placed in the selector
                    const selectedLanguageOption = languageWasUnavailable
                        ? options[languageSelector.selectedIndex - 2] // remembering that english is the 0th option and unavailable was the 1st
                        : options[languageSelector.selectedIndex - 1];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (selectedLanguageOption != null) {
                        selectedLanguageOption.available = true;
                        // console.log("user selected language:");
                        // console.log(selectedLanguageOption);
                        await asyncThis.languageSet(selectedLanguageOption);
                    }
                }
            };
        }
        async languageSet(to) {
            // console.log("language set");
            // console.log(to);
            if (to.value !== this.config.Language) {
                // console.log("setting the new language because the value was valid");
                if (to.value != null) {
                    this.config.Language = to.value;
                    this.config.langOverride = to.value;
                }
                if (to.text != null)
                    this.config.LanguageText = to.text;
                if (to.translated != null)
                    this.config.LanguageTranslated = to.translated;
                //await this.translator.translate();
                const langEvent = new CustomEvent("langEventChanged", {
                    detail: {
                        value: this.config.Language,
                    },
                });
                document.dispatchEvent(langEvent);
            }
        }
        setLanguageDirection(language) {
            // set the direction attribute in the HTML tag based on the language
            // use ltr as a default if not provided by the API
            let textDirection = "ltr";
            if (language.direction != null) {
                if (language.direction == "ltr" || language.direction == "rtl") {
                    textDirection = language.direction;
                }
            }
            document.documentElement.dir = textDirection;
            if (language.value != null && language.value != "") {
                document.documentElement.lang = language.value;
            }
        }
        setErrorStateForLanguageSelector(isInError) {
            // if there is an error in translation we need to display that to the user
            if (isInError) {
                if (this.config.displayOption == "homeaffairs") {
                    document
                        .getElementsByClassName("onlinetranslation-languages")[0]
                        .classList.add("onlinetranslation-unavailable");
                }
            }
        }
        insertMtBannerToPage(document) {
            const topDiv = document.createElement("div");
            topDiv.style.backgroundColor = "#ffc55d";
            topDiv.style.minHeight = "4rem";
            topDiv.style.height = "fit-content";
            topDiv.style.width = "100%";
            topDiv.style.display = "flex";
            const firstDiv = document.createElement("div");
            firstDiv.innerHTML =
                '<span class="material-icons" style="margin: auto;">warning</span>';
            firstDiv.style.marginRight = "auto";
            firstDiv.style.backgroundColor = "#ffd486";
            firstDiv.style.display = "flex";
            firstDiv.style.paddingLeft = "5%";
            firstDiv.style.paddingRight = "5%";
            topDiv.appendChild(firstDiv);
            const secondDiv = document.createElement("div");
            secondDiv.innerText =
                "Warning: Text on this page has been machine translated.";
            secondDiv.style.margin = "auto";
            secondDiv.style.fontSize = "large";
            secondDiv.style.fontFamily = "Roboto, sans-serif";
            topDiv.appendChild(secondDiv);
            const link = document.createElement("link");
            link.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
            link.rel = "stylesheet";
            document.head.appendChild(link);
            const thirdDiv = document.createElement("div");
            thirdDiv.innerHTML = '<span class="material-icons">close</span>';
            thirdDiv.style.cursor = "pointer";
            thirdDiv.style.marginLeft = "auto";
            thirdDiv.style.marginBottom = "auto";
            thirdDiv.style.paddingTop = "10px";
            thirdDiv.style.paddingRight = "10px";
            thirdDiv.addEventListener("click", () => {
                topDiv.remove();
            });
            topDiv.appendChild(thirdDiv);
            document.body.insertBefore(topDiv, document.body.firstChild);
        }
        updateUi(cdnURL) {
            console.log("updating ui");
            const paddingDiv = document.createElement("div");
            Object.assign(paddingDiv.style, {
                width: "100%",
                height: "55px",
            });
            document.body.prepend(paddingDiv);
            if (this.LangDropdownContainer != null) {
                const style = document.createElement("style");
                style.textContent = `
      .odwt-langbar-reset {
      all: unset;
      }`;
                document.head.appendChild(style);
                this.LangDropdownContainer.classList.add("odwt-langbar-reset");
                Object.assign(this.LangDropdownContainer.style, {
                    display: "flex",
                    height: "55px",
                    width: "100%",
                    borderBottom: "1px solid black",
                    fontFamily: "Roboto",
                    backgroundColor: "#fff",
                    position: "absolute",
                    left: "0px",
                    top: "0px",
                });
                this.LangDropdownContainer.innerHTML = `
      <style>
      @import url("https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap");
    </style>
    <div
      style="
        all: unset;
        margin-left: auto;
        max-height: 100%;
        display: flex;
        flex-direction: row;
      "
      class="odwt-container"
      data-notranslate
    >
      <div
        style="
        all: unset;
          display: flex;
          flex-direction: row;
          align-items: center;
          padding-right: 10px;
          color: #005190
        "
        id="onlinetranslation-label"
      >
        <i style="all:unset; padding-right: 10px;">
          <svg
            style="all:unset"
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="17"
            viewBox="0 0 15 15"
            fill="none"
            id="onlinetranslation-label-svg"
          >
            <path
              d="M7.4925 0C3.3525 0 0 3.36 0 7.5C0 11.64 3.3525 15 7.4925 15C11.64 15 15 11.64 15 7.5C15 3.36 11.64 0 7.4925 0ZM12.69 4.5H10.4775C10.2375 3.5625 9.8925 2.6625 9.4425 1.83C10.8225 2.3025 11.97 3.2625 12.69 4.5ZM7.5 1.53C8.1225 2.43 8.61 3.4275 8.9325 4.5H6.0675C6.39 3.4275 6.8775 2.43 7.5 1.53ZM1.695 9C1.575 8.52 1.5 8.0175 1.5 7.5C1.5 6.9825 1.575 6.48 1.695 6H4.23C4.17 6.495 4.125 6.99 4.125 7.5C4.125 8.01 4.17 8.505 4.23 9H1.695ZM2.31 10.5H4.5225C4.7625 11.4375 5.1075 12.3375 5.5575 13.17C4.1775 12.6975 3.03 11.745 2.31 10.5ZM4.5225 4.5H2.31C3.03 3.255 4.1775 2.3025 5.5575 1.83C5.1075 2.6625 4.7625 3.5625 4.5225 4.5ZM7.5 13.47C6.8775 12.57 6.39 11.5725 6.0675 10.5H8.9325C8.61 11.5725 8.1225 12.57 7.5 13.47ZM9.255 9H5.745C5.6775 8.505 5.625 8.01 5.625 7.5C5.625 6.99 5.6775 6.4875 5.745 6H9.255C9.3225 6.4875 9.375 6.99 9.375 7.5C9.375 8.01 9.3225 8.505 9.255 9ZM9.4425 13.17C9.8925 12.3375 10.2375 11.4375 10.4775 10.5H12.69C11.97 11.7375 10.8225 12.6975 9.4425 13.17ZM10.77 9C10.83 8.505 10.875 8.01 10.875 7.5C10.875 6.99 10.83 6.495 10.77 6H13.305C13.425 6.48 13.5 6.9825 13.5 7.5C13.5 8.0175 13.425 8.52 13.305 9H10.77Z"
            />
          </svg>
        </i>
        <p style="all: unset; color: inherit">ODWT Language Selector:</p>
      </div>
      <div
        style="
          all: unset;
          max-height: 100%;
          background-color: #0072c6;
          padding: 10px;
          display: flex;
          align-items: center;
        "
        class="onlinetranslation-languages"
        id="onlinetranslation-dropdown-background"
      >
        <select
          id="onlinetranslation-dropdown"
          style="
            all: unset;
            min-width: 120px;
            width: fit-content;
            color: #fff;
            padding: 10px;
            border: none;
            cursor: pointer;
            margin-right: 30px;
            background-color: inherit;
          "
        >
          <optgroup label="Original" style="all:unset">
            <option value="en" style="all:unset" datanotranslate >English</option>
          </optgroup>
          <optgroup style="all:unset" label="Translated"></optgroup>
        </select>
        <i padding: 15px; cursor: pointer;" id="infoDialogToggle">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="17"
            viewBox="0 0 14 14"
            fill="#fff"
            id="onlinetranslation-disclaimer-svg"
          >
            <path
              d="M9.5475 0H3.9525L0 3.9525V9.5475L3.9525 13.5H9.5475L13.5 9.5475V3.9525L9.5475 0ZM12 8.925L8.925 12H4.575L1.5 8.925V4.575L4.575 1.5H8.925L12 4.575V8.925Z"
            />
            <path
              d="M6.75 10.5C7.16421 10.5 7.5 10.1642 7.5 9.75C7.5 9.33579 7.16421 9 6.75 9C6.33579 9 6 9.33579 6 9.75C6 10.1642 6.33579 10.5 6.75 10.5Z"
            />
            <path d="M6 3H7.5V8.25H6V3Z" />
          </svg>
        </i>
      </div>
    </div>
    <div id="infoDialogModal" class="odwt-modal">
    <div id="infoDialog" class="odwt-modal-content" style="width: fit-content;">
      <div  id="infoHeader" class="odwt-modal-header">
      </div>
      <div id="infoBody" class="odwt-modal-body">
        <div id="translationServiceDisclaimer" >
        </div>
      </div>
      <div id="infoFooter" class="odwt-modal-bottom">
        <button class="odwt-buttonRounded odwt-cancelButton" id="closeInfoModalButton">
            Close
          </button>
      </div>
    </div>
    <style>
      .odwt-modal {
        display: none; /* Hidden by default */
        position: fixed; /* Stay in place */
        padding-top: 100px; /* Location of the box */
        left: 0;
        top: 0;
        width: 100vw; /* Full width */
        height: 100vh; /* Full height */
        overflow: auto; /* Enable scroll if needed */
        background-color: rgb(0, 0, 0); /* Fallback color */
        background-color: rgba(0, 0, 0, 0.4); /* Black w/ opacity */
      }
      /* Modal Content */
      .odwt-modal-content {
        position: relative;
        background-color: #fefefe;
        margin: auto;
        padding: 0;
        border: 1px solid #888;
        width: 25vw;
        box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2),
          0 6px 20px 0 rgba(0, 0, 0, 0.19);
        -webkit-animation-name: animatetop;
        -webkit-animation-duration: 0.4s;
        animation-name: animatetop;
        animation-duration: 0.4s;
        border-radius: 6px;
        font-family: Roboto;
        text-align: center !important;
      }
      
      .odwt-disclaimer {
        text-align: center !important;
        padding: 0px 12px;
      }
      
      /* Add Animation */
      @-webkit-keyframes animatetop {
        from {
          top: -300px;
          opacity: 0;
        }
        to {
          top: 0;
          opacity: 1;
        }
      }
      @keyframes animatetop {
        from {
          top: -300px;
          opacity: 0;
        }
        to {
          top: 0;
          opacity: 1;
        }
      }
      .odwt-modal-header {
        border-top-left-radius: 12px;
        border-top-right-radius: 12px;
        padding: 2px 0px;
        color: black;
        position: relative;
        -webkit-transform: translateY(0%);
        -ms-transform: translateY(0%);
        transform: translateY(0%);
      }
      .odwt-modal-body {
        padding: 2px 2px;
        padding-bottom: 8px;
      }
      .odwt-modal-bottom {
        padding-bottom: 30px;
        border-bottom-left-radius: 12px;
        border-bottom-right-radius: 12px;
      }
      // .reportBackgroundColour {
      //   background-color: #0072c6;
      // }
      // .successBackgroundColour {
      //   background-color: #00bf7d;
      // }
      .odwt-buttonRounded {
        text-align: center;
        text-decoration: none;
        display: inline-block;
        font-size: 16px;
        margin: 4px 12px;
        border-radius: 4px;
        width: 100px;
        height: 42px;
        cursor: pointer;
      }

      .odwt-continueButton {
        background-color: #0072c6;
        color: #fff;
        border: none;
      }

      .odwt-cancelButton {
        background-color: #fff;
        color: #0072c6;
        border: 2px solid #0072c6;
      }
    </style>
      `;
                if (this.LangDropdown != null) ;
                const infoDialogToggle = document.getElementById("infoDialogToggle");
                const infoDialog = document.getElementById("infoDialogModal");
                if (infoDialogToggle != undefined &&
                    infoDialogToggle != null &&
                    infoDialog != undefined &&
                    infoDialog != null) {
                    infoDialogToggle.addEventListener("click", async () => {
                        infoDialog.style.display = "block";
                    });
                    const infoCloseButton = document.getElementById("closeInfoModalButton");
                    if (infoCloseButton != undefined && infoCloseButton != null) {
                        infoCloseButton.addEventListener("click", async () => {
                            infoDialog.style.display = "none";
                        });
                    }
                }
                const infoHeader = document.getElementById("infoHeader");
                if (infoHeader != undefined && infoHeader != null) {
                    let imgPath;
                    if (typeof chrome !== "undefined" &&
                        chrome.runtime &&
                        chrome.runtime.getURL) {
                        imgPath = chrome.runtime.getURL("f53db39ba6f9fd4d213c7faabbde2f76534e6e0b.png");
                    }
                    else {
                        imgPath = cdnURL + "f53db39ba6f9fd4d213c7faabbde2f76534e6e0b.png";
                    }
                    console.log("image path: " + imgPath);
                    const img = document.createElement("img");
                    img.src = imgPath;
                    img.alt = "ODWT Logo";
                    img.width = 223;
                    img.height = 83;
                    infoHeader.insertBefore(img, infoHeader.firstChild);
                }
                const tSDDiv = document.getElementById("translationServiceDisclaimer");
                const dbDiv = document.getElementById("onlinetranslation-dropdown-background");
                const ddDiv = document.getElementById("onlinetranslation-dropdown");
                const ddlDiv = document.getElementById("onlinetranslation-label");
                const cDiv = document.getElementById("onlinetranslation-container");
                const lSVG = document.getElementById("onlinetranslation-label-svg");
                const dSVG = document.getElementById("onlinetranslation-disclaimer-svg");
                console.log(TranslationUI.domainConfig);
                if (TranslationUI.domainConfig.TranslationServiceDisclaimer != null &&
                    TranslationUI.domainConfig.TranslationServiceDisclaimer != "" &&
                    tSDDiv != null) {
                    const sanitisedHTML = purify.sanitize(TranslationUI.domainConfig.TranslationServiceDisclaimer);
                    tSDDiv.innerHTML = sanitisedHTML;
                }
                if (TranslationUI.domainConfig.BackgroundColour != null &&
                    TranslationUI.domainConfig.BackgroundColour != "" &&
                    dbDiv != null) {
                    dbDiv.style.backgroundColor =
                        TranslationUI.domainConfig.BackgroundColour;
                }
                if (TranslationUI.domainConfig.TextOnBackgroundColour != null &&
                    TranslationUI.domainConfig.TextOnBackgroundColour != "" &&
                    ddDiv != null) {
                    ddDiv.style.color = TranslationUI.domainConfig.TextOnBackgroundColour;
                }
                if (TranslationUI.domainConfig.BarBackgroundColour != null &&
                    TranslationUI.domainConfig.BarBackgroundColour != "" &&
                    cDiv != null) {
                    cDiv.style.backgroundColor =
                        TranslationUI.domainConfig.BarBackgroundColour;
                }
                if (TranslationUI.domainConfig.TextColour != null &&
                    TranslationUI.domainConfig.TextColour != "" &&
                    ddlDiv != null) {
                    ddlDiv.style.color = TranslationUI.domainConfig.TextColour;
                }
                if (ddlDiv != null && lSVG != null) {
                    lSVG.style.fill = ddlDiv.style.color;
                }
                if (ddDiv != null && dSVG != null) {
                    dSVG.style.fill = ddDiv.style.color;
                }
                if (TranslationUI.domainConfig.CssContent != null &&
                    TranslationUI.domainConfig.CssContent != "") {
                    const style = document.createElement("style");
                    style.textContent = TranslationUI.domainConfig.CssContent;
                    document.head.appendChild(style);
                }
            }
        }
    }

    async function setDisplay(config, uiMan) {
        config.baseURL = window.location.origin;
        config.fullURL = window.location.href;
        config.urlPath = window.location.pathname;
        config.queryString = window.location.search;
        let configVisibilityResponse = await config.getWidgetVisibility();
        if (configVisibilityResponse != undefined) {
            TranslationUI.domainConfig = {
                TranslationServiceDisclaimer: configVisibilityResponse.TranslationServiceDisclaimer,
                BackgroundColour: configVisibilityResponse.BackgroundColour,
                BarBackgroundColour: configVisibilityResponse.BarBackgroundColour,
                CssContent: configVisibilityResponse.CssContent,
                OverwriteEmbeddedUi: configVisibilityResponse.OverwriteEmbeddedUi,
                TextColour: configVisibilityResponse.TextColour,
                TextOnBackgroundColour: configVisibilityResponse.TextOnBackgroundColour,
            };
        }
        config.widgetIsVisible =
            configVisibilityResponse?.Result === WidgetVisibility.ShowFeedback ||
                configVisibilityResponse?.Result === WidgetVisibility.Visible;
        config.feedBackIsVisible =
            configVisibilityResponse?.Result === WidgetVisibility.ShowFeedback;
        uiMan.setLanguageSelectorVisibility(config.widgetIsVisible, config.urlPathForCDN());
    }
    async function setLanguageDropdown(config, uiMan) {
        config.supportedLanguages = (await config.getSupportedLanguages()) ?? [];
        console.log(config.supportedLanguages);
        let selectedLang = config.Language; // ????
        uiMan.prepareLanguageSelector(selectedLang, config.supportedLanguages);
    }
    async function setFeedBackButton(config, uiMan, floatButton) {
        if (config.widgetIsVisible && config.feedBackIsVisible) ;
    }
    async function setTranslator(config, translator) {
        const foundLang = config.supportedLanguages.find((value) => value.value === config.Language);
        const observerConfig = { attributes: true, childList: false, subtree: true };
        const observer = new MutationObserver(async (mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === "attributes" && !config.visualRecordMode) {
                    const element = mutation.target;
                    await translator.getDomChunks(element);
                }
            }
        });
        let allowTranslation = true;
        var GoogleTranslateObserver = new MutationObserver(function (event) {
            if (document.documentElement.className.match("translated")) {
                observer.disconnect();
                allowTranslation = false;
            }
            else {
                allowTranslation = true;
            }
        });
        GoogleTranslateObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
            childList: false,
            characterData: false,
        });
        console.log("Foundlang", foundLang);
        if (config.widgetIsVisible && foundLang && allowTranslation) {
            observer.disconnect();
            await translator.translate();
            observer.observe(document.body, observerConfig);
            console.log("Translation complete");
        }
        document.body.querySelectorAll("[data-translated='true']");
        document.getElementById("tooltip");
    }

    class MessageHandler {
        uiService;
        translation;
        config;
        messageQueue;
        constructor(uiService, translation, config, messageBacklog) {
            this.uiService = uiService;
            this.translation = translation;
            this.config = config;
            this.messageQueue = [...messageBacklog];
            window.addEventListener("message", (event) => {
                console.log("Message received");
                const data = event.data;
                if (isHaMessage(data)) {
                    console.log("message is one of ours!");
                    this.processMessage(data)
                        .then((res) => {
                        console.log(`Successfully processed the "${data.type}" event - outcome: ${JSON.stringify(res)}`);
                    })
                        .catch((reason) => {
                        console.log(`Failed to process the "${data.type}" event - reason: ${JSON.stringify(reason)}`);
                    });
                }
            }, false);
            this.processBacklog().catch((reason) => {
                console.log("Something went wrong in the message queue");
            });
        }
        async processBacklog() {
            for (;;) {
                if (this.messageQueue.length > 0) {
                    console.log("processing backlog!");
                    // Copy the current queue so it doesn't loop infinitely!
                    const currentQueue = [...this.messageQueue];
                    this.messageQueue.length = 0;
                    console.log("Current queue has: " + currentQueue.length + " messages");
                    let queued = currentQueue.shift();
                    while (queued != undefined) {
                        const data = queued;
                        this.processMessage(queued)
                            .then((res) => {
                            console.log(`Successfully processed the "${data.type}" event - outcome: ${JSON.stringify(res)}`);
                        })
                            .catch((reason) => {
                            console.log(`Failed to process the "${data.type}" event - reason: ${JSON.stringify(reason)}`);
                        });
                        queued = currentQueue.shift();
                    }
                    console.log("finished processing current backlog");
                }
                await sleep(2000);
            }
        }
        hideTranslationContainer() {
            // check if the onlinetranslation-container exists, if so make sure it's hidden
            const translateContainer = document.getElementById("onlinetranslation-container");
            if (translateContainer != null) {
                translateContainer.style.display = "none !important";
            }
        }
        async processMessage(data) {
            switch (data.type) {
                case "alert":
                    alert(data.message);
                    return;
                case "control":
                    return await this.processControl(data);
                case "preview":
                    return await this.processPreview(data);
                case "setblock":
                    return this.processSetBlock(data);
                case "highlightblock":
                    this.processHighlight(data);
                    return;
            }
        }
        async processPreview(data) {
            console.log("Processing a preview message with contents: \n" +
                JSON.stringify(data, null, 2));
            this.config.langOverride = data.language;
            this.config.prereleaseData.prereleaseKey = data.key;
            this.config.visualReviewMode = true;
            this.hideTranslationContainer();
            // try setting the language direction using the data object as a language
            this.uiService.setLanguageDirection(data);
            console.log("processPreview calling translate");
            await this.translation.translate();
            return "complete";
        }
        controlStatus;
        async processControl(data) {
            if (this.controlStatus == "loading") {
                return "already processing a control message";
            }
            this.controlStatus = "loading";
            console.log("Received 'control' or Marionette Mode message");
            this.config.Marionette = true;
            this.hideTranslationContainer();
            // try setting the language direction using the data object as a language
            this.uiService.setLanguageDirection(data);
            // so this annotates the DOM
            await this.translation.translate();
            this.controlStatus = "ready";
            return "complete";
        }
        processSetBlock(data) {
            console.log("set-block received for " + data.checksum);
            if (this.controlStatus != "ready") {
                console.log("Can't set block yet as not being controlled, putting in backlog");
                //await sleep(500)
                this.messageQueue.push(data);
                return "requeuing";
            }
            console.log("Page controlled, so we can set block now");
            const nodes = document.querySelectorAll(`[data-translation-checksum="${data.checksum}"]`);
            console.log("manually setting block for " +
                data.checksum +
                " in " +
                nodes.length +
                " different places");
            for (const node of nodes) {
                node.setAttribute("data-chunk-id", data.chunkId);
                node.innerHTML = data.innerHTML;
            }
            return undefined;
        }
        highlighted;
        processHighlight(data) {
            if (this.highlighted != null) {
                for (const node of this.highlighted) {
                    node.style.border = "";
                }
            }
            const nodes = document.querySelectorAll(`[data-translation-checksum="${data.checksum}"]`);
            this.highlighted = nodes;
            for (const node of this.highlighted) {
                node.style.border = "5px dashed red";
            }
        }
    }
    function isHaMessage(data) {
        if (data == null || typeof data != "object")
            return false;
        const maybe = data;
        if (maybe.type != null && typeof maybe.type == "string") {
            return true;
        }
        return false;
    }

    var ModalState;
    (function (ModalState) {
        ModalState[ModalState["PopupLaunched"] = 0] = "PopupLaunched";
        ModalState[ModalState["Report"] = 1] = "Report";
        ModalState[ModalState["FeedbackSubmitted"] = 2] = "FeedbackSubmitted";
    })(ModalState || (ModalState = {}));
    class FloatButton {
        get LangDropdownContainer() {
            return document.getElementById("onlinetranslation-container");
        }
        createDialog(name) {
            const dialog = document.createElement("dialog");
            dialog.id = name;
            return dialog;
        }
        buildDialog() { }
    }

    console.log("Start translation JS");
    let _Config = null;
    let _Parser = null;
    let _Translator = null;
    let _UiMan = null;
    let _FloatButton = null;
    const canceller = new AbortController();
    let iframed = false;
    const messageBacklog = [];
    function iframeCallbackFunction(event) {
        console.log("Message received in bootstrap handler");
        const data = event.data;
        if (isHaMessage(data)) {
            messageBacklog.push(data);
        }
    }
    const languageCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("language="))
        ?.split("=")[1];
    if (window.location !== window.parent.location) {
        // We're in an iframe context so listen for messages
        iframed = true;
        window.addEventListener("message", iframeCallbackFunction, {
            signal: canceller.signal,
        });
    }
    document.addEventListener("langEventChanged", async function (event) {
        location.reload();
    });
    const configInit = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const langCode = urlParams.get("langCode");
        const directoryUrl = getBrowserDirUrl();
        const configUrl = directoryUrl + "configuration.conf";
        const config = await loadConfigFromFileUrl(configUrl);
        config.langOverride = (langCode || languageCookie) ?? "";
        return config;
    };
    window.addEventListener("load", async () => {
        _Config = await configInit();
        _UiMan = new TranslationUI(_Config);
        console.log("check iframe");
        if (iframed) {
            const secondEvent = new CustomEvent("secondLoader");
            window.dispatchEvent(secondEvent);
        }
        else {
            await setDisplay(_Config, _UiMan);
            await setLanguageDropdown(_Config, _UiMan);
            const secondEvent = new CustomEvent("secondLoader");
            window.dispatchEvent(secondEvent);
        }
    });
    window.addEventListener("secondLoader", async () => {
        if (_Config === null)
            return;
        if (_UiMan === null)
            return;
        _Parser = new Parser();
        _Translator = new Translator(_Config, _Parser);
        _FloatButton = new FloatButton();
        _Translator = new Translator(_Config, _Parser);
        console.log("ifamed === ", iframed);
        if (iframed) {
            console.log("In iframe, so bootstrap messagehandler but don't do anything else");
            new MessageHandler(_UiMan, _Translator, _Config, messageBacklog);
            canceller.abort();
        }
        else {
            try {
                await setFeedBackButton(_Config, _UiMan, _FloatButton);
            }
            catch (error) {
                console.log(error);
            }
            try {
                await setTranslator(_Config, _Translator);
            }
            catch (error) {
                console.log(error);
            }
        }
        console.log("TRANSLATOR MTCHUNKSINCLUDED:::: ", Translator.mtChunksIncluded);
        if (Translator.mtChunksIncluded === true) {
            _UiMan.insertMtBannerToPage(document);
        }
        console.log("End translation JS");
    });
    //
    // const canceller = new AbortController();
    //
    // if (window.location !== window.parent.location) {
    //   // We're in an iframe context so listen for messages
    //   iframed = true;
    //   window.addEventListener("message", iframeCallbackFunction, {
    //     signal: canceller.signal,
    //   });
    // }
    //
    // if (
    //   document.readyState === "loading" ||
    //   document.readyState === "interactive"
    // ) {
    //   console.log("set loading event trigger");
    //   console.log("Document state is " + document.readyState);
    //   window.addEventListener("load", () => {
    //     console.log("event listener triggered");
    //     prepare().catch((reason) => {
    //       console.error("Preparing failed: \n" + reason);
    //     });
    //   });
    // } else {
    //   console.log("DOM already loaded, calling prepare");
    //   console.log("Document state is " + document.readyState);
    //   prepare().catch((reason) => {
    //     console.error("Preparing failed: \n" + reason);
    //   });
    // }
    //
    // const languageCookie = document.cookie
    //   .split("; ")
    //   .find((row) => row.startsWith("language="))
    //   ?.split("=")[1];
    //
    // async function prepare(): Promise<void> {
    //   try {
    //     console.log("new blaire version b");
    //     const directoryUrl = getBrowserDirUrl();
    //     const configUrl = directoryUrl + "configuration.conf";
    //     const config = await loadConfigFromFileUrl(configUrl);
    //
    //     const urlParams = new URLSearchParams(window.location.search);
    //     const langCode = urlParams.get("langCode");
    //
    //     console.log("Config object found:\n" + JSON.stringify(config));
    //
    //     const parser = new Parser();
    //     const translator = new Translator(config, parser);
    //     const uiMan = new TranslationUI(config, translator);
    //     const floatButton = new FloatButton();
    //
    //     if (iframed) {
    //       console.log(
    //         "In iframe, so bootstrap messagehandler but don't do anything else",
    //       );
    //       new MessageHandler(uiMan, translator, config, messageBacklog);
    //       canceller.abort();
    //     } else {
    //       await setDisplayAndTranslate(
    //         config,
    //         langCode,
    //         languageCookie,
    //         uiMan,
    //         floatButton,
    //         translator,
    //       ); // Don't need the return value for browser
    //     }
    //   } catch (e) {
    //     console.error("Prepare died :(", e);
    //     throw new Error("Failure in prepare");
    //   }
    // }
    function getBrowserDirUrl() {
        const scripts = document.getElementsByTagName("script");
        let translateScript = undefined;
        for (const script of scripts) {
            if (script.src && script.src.includes("translation.js")) {
                translateScript = script;
                break;
            }
        }
        if (translateScript == null) {
            throw new Error("The translation.js needs to be loaded from a DOM script element to find the config file");
        }
        const fullUrl = translateScript.src;
        const dirUrl = fullUrl.substring(0, fullUrl.lastIndexOf("/") + 1);
        return dirUrl;
    }

})();
//# sourceMappingURL=translation.js.map
