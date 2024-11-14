(function () {
'use strict'

// 拡張機能が無効化されていたら実行しない
const is_disabled = !!localStorage.getItem('extension_disabled')
if (is_disabled) return

//----------
// Wiki拡張本体
//----------

class WikiExtension {

//----------
// 共通処理
//----------

constructor () {
    this.updateReadyState('initializing')
    if (document.readyState === 'loading') {
        document.addEventListener('readystatechange', () => {
            if (document.readyState === 'interactive') {
                this.init()
            }
       })
    } else {
        this.init()
    }
} // constructor

// 初期化
init () {
    if (this.readyState !== 'initializing') {
        throw new Error('already initialized')
    }

    this.initPageInfo()
    this.initExperimental()
    this.initCustomHashParams()
    this.initMembersData()
    this.updateReadyState('initialized')

    const shouldStopBeforeSetup = !!localStorage.getItem('stop_before_setup')
    if (shouldStopBeforeSetup) {
        console.log('setup stopped')
    } else {
        window.setTimeout(() => { this.setup() })
    }
} // init

// 各画面に魔改造を適用
setup () {
    if (this.readyState === 'initializing') {
        throw new Error('not yet initialized')
    }

    if (this.pageType === 'article') {
        this.setupStripedTable()
        this.setupTableFilter()
        this.setupScrollableTable()
        this.setupSongListConverter() // 入力補助ツールページ
        this.setupRegexReplacer() // 入力補助ツールページ
        this.setupAutoFilter() // 歌唱楽曲一覧ページなど
        this.setupDataPageRedirector() // データページからのリダイレクト
        this.setupThumbnailColumn()
        if (!this.isMobileLayout) {
            this.setupTableFilterGenerator() // 右メニュー
        }

    } else if (this.pageType === 'edit') {
        // PC版のみ適用
        if (!this.isMobileLayout) {
            this.setupEditingTools()
            this.setupSyntaxChecker()
        }
    }

    this.updateReadyState('loaded')
    console.log('extension has applied.')
} // setup

// 状態を更新
updateReadyState (name) {
    this.readyState = name
    const event = new Event('extension-readystatechange')
    event.wikiExtension = this
    event.readyState = this.readyState
    document.dispatchEvent(event)
}

// ページ情報を確認
initPageInfo () {
    let wikiId = null
    let restPath = ''

    if (location.hostname === 'seesaawiki.jp') {
        [wikiId, restPath] = location.pathname.split(/^\/(?:w\/)?([^/]+)/).slice(1)
    }

    // Wiki ID
    this.wikiId = wikiId
    // ページ種別
    this.pageType = getPageType(restPath)
    // スマホ向け
    this.isMobileLayout = !!document.head.querySelector("meta[name='format-detection']")

    function getPageType (restPath) {
        if (restPath.startsWith('/d/') || restPath === '/') {
            return 'article'
        } else if (restPath.startsWith('/e/')) {
            return 'edit'
        } else if (restPath.startsWith('/comment/')) {
            return 'comment'
        } else if (restPath.startsWith('/l/')) {
            return 'page_list'
        } else if (restPath.startsWith('/diff/')) {
            return 'diff'
        } else if (restPath.startsWith('/history/')) {
            return 'history'
        } else if (restPath.startsWith('/dv/')) {
            return 'version'
        } else if (restPath.startsWith('/members/')) {
            return 'members'
        } else if (restPath.startsWith('/r/')) {
            return 'member_history'
        } else if (restPath.startsWith('/bbs/')) {
            return 'bbs'
        } else if (restPath.startsWith('/search')) {
            return 'search'
        }
        return null
    }
} // initPageInfo

// 実験モードの確認・切り替え
initExperimental () {
    this.isExperimentalEnabled = !!localStorage.getItem('experimental_mode')
    if (this.isExperimentalEnabled) {
        console.log('experimental mode: on')
    }

    const checkExperimental = () => {
        let changed = false
        if (location.hash === '#enable-experimental') {
            this.isExperimentalEnabled = true
            changed = true
        } else if (location.hash === '#disable-experimental') {
            this.isExperimentalEnabled = false
            changed = true
        }

        if (changed) {
            console.log('experimental mode: ' + (this.isExperimentalEnabled ? 'on' : 'off'))
            history.replaceState(null, null, location.pathname + location.search)
            if (this.isExperimentalEnabled) {
                localStorage.setItem('experimental_mode', 'true')
            } else {
                localStorage.removeItem('experimental_mode')
            }
        }
    }

    window.addEventListener('hashchange', function () {
        checkExperimental()
    })
    checkExperimental()
} // initExperimental

//----------
// URLパラメータとアンカージャンプ
//----------

initCustomHashParams () {

    // パラメータ収集
    const parseParams = (urlStr) => {
        const url = new URL(urlStr)
        const params = new MyURLSearchParams(url.search)
        let hash = url.hash

        const sep = hash.indexOf('?')
        if (sep > -1) {
            const search = hash.substring(sep)
            const hashParams = new MyURLSearchParams(search)
            hashParams.forEach((val, key) => {
                params.set(key, val)
            })
            hash = hash.substring(0, sep)
        }

        params.freeze()

        return [params, hash]
    }

    // 情報更新＆イベント発火
    const updateParams = (params, hash, trigger) => {
        this.urlParams = params
        this.urlHash = hash

        if (trigger) {
            const event = new Event('extension-paramchange')
            event.params = params
            event.hash = hash
            window.dispatchEvent(event)
        }
    }

    // アンカージャンプ
    const jumpToAnchor = (aname) => {
        const anchor = document.getElementById(aname) || Array.prototype.find.call(document.querySelectorAll('a[name]'), (el) => (el.name === aname))
        if (anchor) {
            // anchor.scrollIntoView();
            // window.scrollTo(0, anchor.offsetTop - 40)

            const yMargin = 40
            let target = anchor
            let prev = null

            // 非表示要素の場合、表示されてる親要素をターゲットにする
            while (target.offsetParent === null) {
                prev = target
                target = target.parentElement
            }
            let yDiff = target.getBoundingClientRect().top

            // 親要素にした場合、本来表示されるはずの位置を計算
            if (prev !== null) {
                while (prev !== null && prev.offsetParent === null) {
                    prev = prev.previousElementSibling
                }
                if (prev !== null) {
                    yDiff = prev.getBoundingClientRect().bottom
                }
            }

            window.scrollTo({top: yDiff + window.pageYOffset - yMargin})
        }
    }

    // hashが変わった時に情報更新＆イベントを発火
    window.addEventListener('hashchange', (e) => {
        const [params, hash] = parseParams(e.newURL)
        updateParams(params, hash, true)
    })

    // hashが変わった時に本来のアンカージャンプを実行
    window.addEventListener('extension-paramchange', (e) => {
        if (e.hash.length > 1) {
            const aname = e.hash.substring(1)
            jumpToAnchor(aname)
        }
    })

    // ページ読み込み時に初回処理
    {
        const [params, hash] = parseParams(location.href)
        updateParams(params, hash, false)
    }

    // ページ読み込み時に初回ジャンプ
    document.addEventListener('DOMContentLoaded', () => {
        if (this.urlHash.length > 1 && this.urlHash !== location.hash) {
            const aname = this.urlHash.substring(1)
            jumpToAnchor(aname)
        }
    })

} // initCustomHashParams

//----------
// ストライプ表示機能 class="stripe" (記事画面)
//----------

setupStripedTable () {

    // ストライプ表示を更新するやつ
    $('table.stripe').on('update-stripe', function () {
        $(this).find('> tbody > tr').filter(':visible')
            .filter(':even').removeClass('even').addClass('odd').end()
            .filter(':odd').removeClass('odd').addClass('even')
    })

    // ストライプ適用
    $('table.stripe').trigger('update-stripe')

    // フィルター適用時に自動更新
    $('table.stripe.filter').on('change', function () {
        $(this).trigger('update-stripe')
    })

} // setupStripedTable

//----------
// フィルター機能の改善 class="filter regex" (記事画面)
//----------

setupTableFilter () {

    // テーブルにイイカンジのフィルター機能を搭載
    $('table.filter').each(function (i) {
        const input = $('#table-filter-' + i)
        const table = $(this)

        // フィルター入力欄とテーブルを紐づけ
        input.data('target', table)

        // オリジナルの入力監視機能を無効化
        input.unbind('focus').blur().unbind('blur')

        // 正規表現切り替えボタンを追加
        const regexToggleButton = $('<input type="checkbox">')
        regexToggleButton.prop('checked', table.hasClass('regex'))
        const regexToggleIcon = $('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-regex" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M3.05 3.05a7 7 0 0 0 0 9.9.5.5 0 0 1-.707.707 8 8 0 0 1 0-11.314.5.5 0 1 1 .707.707m9.9-.707a.5.5 0 0 1 .707 0 8 8 0 0 1 0 11.314.5.5 0 0 1-.707-.707 7 7 0 0 0 0-9.9.5.5 0 0 1 0-.707M6 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0m5-6.5a.5.5 0 0 0-1 0v2.117L8.257 5.57a.5.5 0 0 0-.514.858L9.528 7.5 7.743 8.571a.5.5 0 1 0 .514.858L10 8.383V10.5a.5.5 0 1 0 1 0V8.383l1.743 1.046a.5.5 0 0 0 .514-.858L11.472 7.5l1.785-1.071a.5.5 0 1 0-.514-.858L11 6.617z"/></svg>')
        regexToggleIcon.css("vertical-align", "text-bottom")
        const regexToggleLabel = $('<label></label>')
        regexToggleLabel.append(regexToggleButton)
        regexToggleLabel.append(regexToggleIcon)
        const originalFilter = input.parent()
        originalFilter.css('display', 'inline-block') // .input-table-filter
        originalFilter.wrap('<div></div>')
        const filterWrapper = originalFilter.parent()
        filterWrapper.append(regexToggleLabel)

        // フィルター入力欄と正規表現ボタンを紐づけ
        input.data('regex', regexToggleButton)

        // 自前の入力監視・フィルター適用機能で上書き
        input.textChange({
            change: function (self) {
                $(self).trigger('apply')
            }
        })
        input.on('change', function () {
            $(this).trigger('apply')
        })
        regexToggleButton.on('change', function () {
            input.trigger('apply')
        })

    })

    // 正規表現・大小区別に応じたマッチング関数を生成するやつ
    const gen_tester = (pattern, ignore, regex) => {
        if (regex) {
            try {
                const re = new RegExp(pattern, (ignore ? 'i' : ''))
                return (t) => re.test(t)
            } catch (e) {
                return null
            }
        } else {
            if (ignore) {
                const sub = pattern.toLowerCase()
                return (t) => t.toLowerCase().includes(sub)
            } else {
                return (t) => t.includes(pattern)
            }
        }
    }

    // 正規表現対応のフィルター適用処理
    $("input[id^='table-filter-']").on('apply', function () {
        const regexToggleButton = $(this).data('regex')

        const pattern = $(this).val()
        const is_regex = regexToggleButton.prop('checked')
        const ignore_case = true // 一律で大小区別なし

        const state = pattern + (is_regex ? 'r' : '-') + (ignore_case ? 'i' : '-');
        const prev = $(this).data('prev')
        if (prev === state) return
        $(this).data('prev', state)

        const table = $(this).data('target')

        // 設定に応じたマッチング関数を用意
        const test = gen_tester(pattern, ignore_case, is_regex)
        if (test === null) return

        // フィルター適用
        const rows = table.find('> tbody > tr')
        rows.each((i, row) => {
            $(row).toggle(test($(row).text()))
        })

        // ストライプ更新など
        table.trigger('change')
    })

} // setupTableFilter

//----------
// 縦横スクロールテーブル class="scrollX scrollY" (記事画面)
//----------

setupScrollableTable () {

    $('table[id*="content_block_"].scrollX').wrap('<div class="x-scroller">')
    $('table[id*="content_block_"].scrollY').wrap('<div class="y-scroller">')

} // setupScrollableTable

//----------
// 歌唱楽曲リスト変換ツール (入力補助ツールページ)
//----------

setupSongListConverter () {

    const title = document.title
    const boxes = {}

    initSongListConverter.call(this)

    function initSongListConverter () {
        const userArea = document.querySelector('div.user-area')
        // 見出しを基準にする。見つからなければ適用なし
        const headings = userArea.querySelectorAll('div.title-1')
        const converterHeading = Array.prototype.find.call(headings, (heading) => {
            const text = heading.textContent
            // ホロライブ、どっとライブ、もちぷろ、のりプロ、しぐれうい、ホロスターズ
            return text.match('歌リスト変換書き換え簡略版')
        })
        if (!converterHeading) {
            return
        }

        // 基準の見出し以降からテキストボックスを8つ見つける。見つからなければ適用なし
        const textareas = userArea.querySelectorAll('textarea.PLAIN-BOX')
        const firstBoxIndex = Array.prototype.findIndex.call(textareas, (textarea) => {
            return (WikiExtension.compareNodeOrder(textarea, converterHeading) > 0)
        })
        if (firstBoxIndex < 0 || firstBoxIndex + 7 >= textareas.length) {
            return
        }

        boxes.name = textareas[firstBoxIndex]
        boxes.roman = textareas[firstBoxIndex + 1]
        boxes.date = textareas[firstBoxIndex + 2]
        boxes.cast = textareas[firstBoxIndex + 3]
        boxes.url = textareas[firstBoxIndex + 4]
        boxes.songs = textareas[firstBoxIndex + 5]
        boxes.castOut = textareas[firstBoxIndex + 6]
        boxes.songsOut = textareas[firstBoxIndex + 7]

        if (title.includes('編集用_入力補助ツール')) {
            window.setInterval(convertSongList.bind(this), 1000)
        }
    }

    // タイムスタンプの形式チェック
    function extractHMSformat(timeStr) {
      const regex = /(\d{1,2}:\d{1,2}(?::\d{1,2})?)/;
      const match = timeStr.match(regex);
      if (match) {
        return match[1];
      }
      return null;
    }

    // タイムスタンプの形式チェック
    function correntHMSformat(hmsStr) {
      if (!hmsStr) {
        return null;
      }
      let seconds = ((hmsStr) => {
        const parts = hmsStr.split(':').map(Number).reverse();
        const multipliers = [1, 60, 3600];  // seconds, minutes, hours
        return parts.reduce((acc, part, index) => acc + part * multipliers[index], 0);
      })(hmsStr);
      const hours = Math.floor(seconds / 3600);
      seconds -= hours * 3600;
      const minutes = Math.floor(seconds / 60);
      seconds -= minutes * 60;
      return `${hours.toString().padStart(2, '0')}h${minutes.toString().padStart(2, '0')}m${seconds.toString().padStart(2, '0')}s`.replace(/00[hms]/g, '');
    }

    // 歌唱楽曲リスト変換処理
    function convertSongList () {
        const name = boxes.name.value.replace(/\n/g, '')
        const roman = boxes.roman.value.replace(/\n/g, '')
        const dateSlash = boxes.date.value.replace(/\n/g, '')
        const castTitle = boxes.cast.value.replace(/\n/g, '')
        const url = boxes.url.value.replace(/\n/g, '')
        const songs = boxes.songs.value.split('\n')
        const datePlain = dateSlash.replace(/\//g, '')
        const dateDot = dateSlash.replace(/\//g, '.')
        const castAnchor = roman + datePlain
        const dataAnchor = `data_${roman}${datePlain}`
        const escapedCastTitle = WikiExtension.escapeWikiComponents(castTitle)

        const songRows = []

        for (const line of songs) {
          if (!line) continue
          const hmsStr = extractHMSformat(line);
          const timestamp = correntHMSformat(hmsStr);

          const songName = !hmsStr ? line : line.split(hmsStr).pop().replace(/^[ 　]+|[ 　]+$/g, '');
          const escapedSongName = WikiExtension.escapeWikiComponents(songName)
          const songUrl = timestamp ? `[[${escapedSongName}>>${url}&t=${timestamp}]]` : `[[${escapedSongName}>>${url}]]`;
          const index = ('00' + (songRows.length + 1)).slice(-3)
          const songRow = [
            name,
            `[[${dateDot}生>#${castAnchor}]]-${index}`,
            songUrl,
            ''
          ]
          if (songRows.length === 0) {
            songRow[1] += `&aname(${dataAnchor})`
          }
          songRows.push('|' + songRow.join('|') + '|')
        }

        const castRow = [
            name,
            `[[${dateSlash}>#${dataAnchor}]]&aname(${castAnchor})`,
            `[[${escapedCastTitle}>>${url}]]`,
            String(songRows.length)
        ]

        switch (this.wikiId) {
            case 'siroyoutuber': // どっとライブ
            case 'hololivetv': // ホロライブ
            case 'mochi8hiyoko': // もちぷろ
                castRow.push('')
                break
        }

        boxes.castOut.value = '|' + castRow.join('|') + '|'
        boxes.songsOut.value = songRows.join('\n')

        boxes.castOut.readOnly = true
        boxes.songsOut.readOnly = true
    }

} // setupSongListConverter

//----------
// 正規表現置換ツール (入力補助ツールページ)
//----------

setupRegexReplacer () {

    const boxes = {}

    initRegexReplacer()

    function initRegexReplacer () {
        const userArea = document.querySelector('div.user-area')
        // 見出しを基準にする。見つからなければ適用なし
        const headings = userArea.querySelectorAll('div.title-1')
        const converterHeading = Array.prototype.find.call(headings, (heading) => {
            const text = heading.textContent
            // ホロライブ、どっとライブ、もちぷろ、しぐれうい、ホロスターズ
            return text.match('正規表現置換')
        })
        if (!converterHeading) {
            return
        }

        // 基準の見出し以降からテキストボックスを4つ見つける。見つからなければ適用なし
        const textareas = userArea.querySelectorAll('textarea.PLAIN-BOX')
        const firstBoxIndex = Array.prototype.findIndex.call(textareas, (textarea) => {
            return (WikiExtension.compareNodeOrder(textarea, converterHeading) > 0)
        })
        if (firstBoxIndex < 0 || firstBoxIndex + 3 >= textareas.length) {
            return
        }

        boxes.before = textareas[firstBoxIndex]
        boxes.pattern = textareas[firstBoxIndex + 1]
        boxes.replacement = textareas[firstBoxIndex + 2]
        boxes.after = textareas[firstBoxIndex + 3]

        const links = userArea.querySelectorAll('a')
        // for (const link of links) {
        for (const link of Array.from(links)) {
            if (link.getAttribute('href') === '#regreplace') {
                link.addEventListener('click', regReplace, false)
            }
        }
    }

    // 正規表現変換処理
    function regReplace (e) {
        e.preventDefault()
        let text = boxes.before.value
        const pattern = boxes.pattern.value.replace(/\n$/, '')
        const replacement = boxes.replacement.value.replace(/\n$/, '')
        text = text.replace(new RegExp(pattern, 'g'), replacement)
        boxes.after.value = text
    }

} // setupRegexReplacer

//----------
// 自動絞り込み (歌唱楽曲一覧ページなど)
//----------

setupAutoFilter () {

    applyFilters.call(this)

    function applyFilters () {
        const title = document.title

        let match
        if ((match = /^(.+?)\s*【歌唱楽曲一覧】/.exec(title)) !== null) {
            const name = match[1]

            // どっとライブ
            if (this.wikiId === 'siroyoutuber' && !(name.startsWith('どっとライブ') || name.startsWith('ぶいぱい'))) {
                applyFilter(2, name) // 簡易
                applyFilter(3, name) // 外部
                applyFilter(4, name) // 歌ってみた
                applyFilter(5, name) // イベント
            }
            // ホロライブ
            if (this.wikiId === 'hololivetv' && !name.startsWith('ホロライブ')) {
                applyFilter(2, name) // オリジナルソング
                applyFilter(3, name) // 歌ってみた
                applyFilter(4, name) // イベント
            }
            // のりプロ
            if (this.wikiId === 'noriopro' && !name.startsWith('のりプロ')) {
                applyFilter(0, name) // オリジナルソング
                applyFilter(1, name) // 歌ってみた
            }
            // 逢魔きらら・胡桃澤もも
            if (this.wikiId === 'momokira') {
                applyFilter(0, name) // オリジナルソング
                applyFilter(1, name) // 歌ってみた
            }
            // ホロスターズ
            if (this.wikiId === 'holostarstv' && !name.startsWith('ホロスターズ')) {
                applyFilter(2, name) // オリジナルソング
                applyFilter(3, name) // 歌ってみた
            }
            // wiki別分岐終了
        }

        // すべてのページ
        const keyword = this.urlParams.get('keyword')
        if (keyword) {
            const order = this.urlParams.get('order') || 0
            applyFilter(order, keyword)
        }
    }

    window.addEventListener('extension-paramchange', (e) => {
        const keyword = e.params.get('keyword')
        if (keyword) {
            const order = e.params.get('order') || 0
            applyFilter(order, keyword)
        }
    }, false)

    function applyFilter (indice, keyword) {
        for (const idx of String(indice).split(',')) {
            const table = $('table.filter').eq(idx)
            const input = $(`#table-filter-${idx}`)
            if (!input) return
            table.addClass('regex')
            const regexToggleButton = $(input).data('regex')
            regexToggleButton.prop('checked', true)
            input.val(keyword).change()
        }
    }

} // setupAutoFilter

//----------
// フィルターリンク生成機能 (記事画面右メニュー)
//----------

setupTableFilterGenerator () {

    // HTML側から関数を呼び出せるように
    window.createFilterSearch = createFilterSearch

    function createFilterSearch () {
        const link = document.getElementById('freeAreaRegExp')
        if (!link) return
        const form = link.parentNode

        const elements = form.querySelectorAll('input[name="order"]')
        const checked = Array.prototype.find.call(elements, (radio) => radio.checked)
        const order = (checked ? checked.value : 0)

        const filterInput = document.getElementById(`table-filter-${order}`)
        if (!filterInput) return

        const url = new URL(location.href)
        const searchParams = new MyURLSearchParams(url.search)
        searchParams.delete('keyword')
        searchParams.delete('order')
        url.search = searchParams.toString()
        const hashParams = new MyURLSearchParams()
        hashParams.set('keyword', filterInput.value)
        hashParams.set('order', order)
        url.hash = '#' + hashParams.toString()

        link.setAttribute('href', url)
    }

} // setupTableFilterGenerator

//----------
// データページのページリダイレクト生成機能（_データページから本体のページへ）
//----------

setupDataPageRedirector() {
  const userArea = document.querySelector('div.user-area');
  if (userArea === null) {
    throw new Error('failed to find user-area element');
  }

  const tables = document.querySelectorAll('table[id*="content_block_"]');
  Array.prototype.find.call(tables, (table) => {
    // --redirect-to-url 指定のあるテーブルがあれば
    const redirectTo = table.style.getPropertyValue('--redirect-to-url');
    if (!redirectTo) return;

    // 記事上部に誘導メッセージを表示する
    const message = document.createElement('div');
    message.style.color = '#d00';

    // --redirect-to-label 指定があればUTF-8でURLデコードしてリンクテキストとして使用する
    const link = document.createElement('a');
    const redirectToLabel = decodeURIComponent(table.style.getPropertyValue('--redirect-to-label'));
    link.innerText = redirectToLabel || 'こちら';
    link.href = redirectTo;

    message.appendChild(document.createTextNode('※このページは編集用データページです。記事本体は'));
    message.appendChild(link);
    message.appendChild(document.createTextNode('を参照してください。'));

    userArea.insertBefore(message, userArea.firstChild);
  });
}  //setupDataPageRedirector

//----------
// サムネイルカラム機能 class="thumbnail-N" (記事画面)
//----------

setupThumbnailColumn() {
  // thumbnail-N 指定ありのテーブルが対象
  $("table[class^='thumbnail-'], table[class*=' thumbnail-']").each(function(i) {
    const table = $(this);
    const m = this.className.match(/(?:^| )thumbnail-([0-9]+)(?:$| )/); // XXX: 使えるならLookbehind
    if (!m) return;

    // 対象のカラム/セル
    const col = parseInt(m[1], 10);
    const cells = $(`th:nth-child(${col}), td:nth-child(${col})`, table);

    // 「thumbnail」というリンクを画像に置換
    const thumbnailLinks = $("> a[href]", cells);
    thumbnailLinks.replaceWith(function() {
      if (this.innerText !== "thumbnail") return;

      const url = this.href.split("#", 1)[0];
      const params = new MyURLSearchParams(this.href.replace(/^.*?#/, ""));

      const img = document.createElement("img");
      // URL中の #r=H:V パラメータをもとに縦横比を指定 (w=100%指定ができるように)
      if (params.has("r")) {
        const m = params.get("r").match(/^([1-9][0-9]*):([1-9][0-9]*)$/);
        if (m) {
          img.width = m[1];
          img.height = m[2];
        }
      }
      // URL中の #w=...&h=... パラメータをもとに表示サイズを指定
      if (params.has("w")) {
        const w = params.get("w");
        img.style.width = w + (/^[0-9]+$/.test(w) ? "px" : "");
      } else {
        img.style.width = "auto";
      }
      if (params.has("h")) {
        const h = params.get("h");
        img.style.height = h + (/^[0-9]+$/.test(h) ? "px" : "");
      } else {
        img.style.height = "auto";
      }
      // 遅延読み込み指定
      img.loading = "lazy";
      img.src = url;

      return img;
    });
  });
}  //setupThumbnailColumn

//----------
// 編集ツール (編集画面)
//----------

setupEditingTools () {

    let is_area_open = !!localStorage.getItem('tools_area_open')
    const tools_area = initEditingTools()

    addTool('options', '設定', function () {
        const tool_content = this
        tool_content.addClassName('tool-options')

        addCheckbox('syntax_check', '文法チェックを有効化', false)
        addCheckbox('syntax_check.folding', '文法チェック：折りたたみの整合性チェック', true)
        addCheckbox('syntax_check.box', '文法チェック：BOX記法の整合性チェック', true)
        addCheckbox('syntax_check.table', '文法チェック：テーブルの整合性チェック', true)
        addCheckbox('syntax_check.anchor', '文法チェック：アンカーの重複チェック', true)
        addCheckbox('syntax_check.shorturl', '文法チェック：短縮URLのチェック', true)
        addCheckbox('syntax_check.trailing_space', '文法チェック：行末半角スペースのチェック', true)

        function addCheckbox (name, label, default_, onchanged) {
            const el_label = document.createElement('label')
            const checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.checked = !!JSON.parse(localStorage.getItem(`tool.${name}.enabled`) || default_.toString())
            el_label.appendChild(checkbox)
            const text = document.createTextNode(label)
            el_label.appendChild(text)

            localStorage.setItem(`tool.${name}.enabled`, checkbox.checked.toString())
            checkbox.addEventListener('change', function (e) {
                localStorage.setItem(`tool.${name}.enabled`, this.checked.toString())
                window.dispatchEvent(new Event('option-changed'))
                if (onchanged) {
                    onchanged.call(this, e)
                }
            })

            tool_content.appendChild(el_label)
        }
    })

    addSimpleProcessor('htmlref', '実体参照変換', (text) => {
        return WikiExtension.escapeWikiComponents(text)
    }, (
        `数値参照に変換する(wiki記法と衝突する文字処理用)

        ( → &#40;
        ! → &#33;
        [ → &#91;
        # → &#35; など`.replace(/^[ \t]+/gm, '')
    ))

    addSimpleProcessor('tweetref', 'ツイート参照タグ', (text) => {
        text = text.split(/[\r\n]+/).map((line) => {
            const url = parseURL(line)
            if (url && (url.hostname === 'twitter.com' || url.hostname === 'x.com')) {
                const pathArr = url.pathname.split('/')
                const index = pathArr.findIndex(v => v === 'status')
                if (index >= 0) {
                    return `&twitter(${pathArr[index + 1]})\n` +
                        `((Twitter [[@${pathArr[index - 1]}>>${url}]]))`
                }
            }
            return line
        }).filter(Boolean).join('\n')
        if (text) text += '\n'
        return text
    }, (
        `ツイートURLからwikiタグ2種に変換する (1行＝1 URL)

        https://twitter.com/tokino_sora/status/1567175591358787585
        ↓↓↓
        &twitter(1567175591358787585)
        ((Twitter [[@tokino_sora>>https://twitter.com/tokino_sora/status/1567175591358787585]]))`.replace(/^[ \t]+/gm, '')
    ))

    addSimpleProcessor('hashtag', 'ハッシュタグリンク', (text) => {
        // 日本語向けに簡易判定
        const char = /(?:[0-9A-Za-z_]|(?![\u3000-\u3002\u3004\u3007-\u301b\uff01-\uff0f\uff1a-\uff1f\uff3b-\uff40\uff5b-\uff65])[^\x00-\x7f])/
        // URLや [[リンク]] などの一部文法を回避
        const avoid = /(?:\[\[.*?\]\]|https?:\/\/[0-9A-Za-z!#$%&'()*+,\-./:;=?@_~]+|&#[0-9A-Za-z]+;|&color\([^)]*\)|\|(?:bg)?color\([^)]*\):|${char.source})/
        const pattern = new RegExp(`${avoid.source}|[#＃](${char.source}+)`, 'gi')
        text = text.replace(pattern, (orig, tag) => {
            if (!tag) return orig
            if (!/[^0-9_]/.test(tag)) return orig
            const escapedTag = WikiExtension.escapeWikiComponents('#' + tag)
            return `[[${escapedTag}>>https://twitter.com/hashtag/${encodeURI(tag)}]]`
        })
        return text
    }, (
        `テキスト中のTwitterハッシュタグに自動でリンクを張る

        ハッシュタグ「#初配信」でツイート
        ↓↓↓
        ハッシュタグ「[[&#35;初配信>>https://twitter.com/hashtag/%E5%88%9D%E9%85%8D%E4%BF%A1]]」でツイート`.replace(/^[ \t]+/gm, '')
    ))

    addSimpleProcessor('videolist', '動画サムネ付きリンク', (text) => {
        text = text.split(/[\r\n]+/).map((line) => {
            const url = parseURL(line)
            let vid
            if (url && url.hostname === 'www.youtube.com') {
                if (url.pathname.startsWith('/live/')) {
                    vid = url.pathname.split('/')[2]
                } else {
                    vid = url.searchParams.get('v')
                }
            } else if (url && url.hostname === 'youtu.be') {
                vid = url.pathname.slice(1)
            }
            if (vid) {
                return `[[&ref(https://i.ytimg.com/vi/${vid}/mqdefault.jpg,100%)>>https://youtu.be/${vid}]]`
            }
            return line
        }).filter(Boolean).join('\n')
        if (text) text += '\n'
        return text
    }, (
        `YouTubeの動画URLをサムネ付きタグに変換する (動画一覧用加工、1行＝1 URL)

        https://www.youtube.com/watch?v=TjGC7Jzc5ns
        https://youtu.be/TjGC7Jzc5ns
        ↓↓↓
        [[&ref(https://i.ytimg.com/vi/TjGC7Jzc5ns/mqdefault.jpg,100%)>>https://youtu.be/TjGC7Jzc5ns]]`.replace(/^[ \t]+/gm, '')
    ))

    /*
    // https://amp.dev/ja/documentation/guides-and-tutorials/learn/amp-caches-and-cors/how_amp_pages_are_cached/
    // https://amp.dev/ja/documentation/guides-and-tutorials/learn/amp-caches-and-cors/amp-cache-urls/
    addSimpleProcessor('imgampcache', '画像軽量化', (text) => {
        text = text.split(/[\r\n]+/).map((line) => {
            const url = parseURL(line)
            if (!(url && url.pathname.match(/(?:jpg|png|gif)$/i))) {
                return line
            }
            let sub = url.hostname.replace(/-/g, '--').replace(/\./g, '-')
            if (sub.substring(2, 4) === '--') {
                sub = `0-${sub}-0`
            }
            if (url.hash !== '') {
                url.hash = ''
            }
            const shrinkWidth = 240
            const displayWidth = '100%'
            const linkType = '>'
            const secure = (url.protocol === 'https:' ? 's/' : '')
            const ampUrl = `https://${sub}.cdn.ampproject.org/ii/w${shrinkWidth}/${secure}${url.hostname}${url.pathname}${url.search}`
            return `[[&ref(${ampUrl},${displayWidth})${linkType}${url}]]`
        }).filter(Boolean).join('\n')
        if (text) text += '\n'
        return text
    }, (
        `容量の大きい画像を軽量化して表示するタグに変換する (1行＝1 URL)
        ※軽量化にはGoogle AMP キャッシュを利用、幅240pxに縮小

        https://image01.seesaawiki.jp/h/v/xxx/XXXXXXXXXX.jpg
        ↓↓↓
        [[&ref(https://image01-seesaawiki-jp.cdn.ampproject.org/ii/w240/s/image01.seesaawiki.jp/h/v/xxx/XXXXXXXXXX.jpg,100%)>https://image01.seesaawiki.jp/h/v/xxx/XXXXXXXXXX.jpg]]`.replace(/^[ \t]+/gm, '')
    ))
    */

    // https://wsrv.nl/
    addSimpleProcessor('imgcache', '画像軽量化', (text) => {
        text = text.split(/[\r\n]+/).map((line) => {
            const url = parseURL(line)
            if (!url) {
                return line
            }
            if (url.hash !== '') {
                url.hash = ''
            }
            const shrinkWidth = 240
            const outputFormat = 'jpg'
            const displayWidth = '100%'
            const linkType = '>'
            const escapedUrl = url.toString().replace(/[^0-9A-Za-z_\-\/\:]/g, (x) => encodeURIComponent(x))
            const filenameParam = (url.pathname.match(/(?:jpg|png|gif)$/i) ? '' : `&filename=image.${outputFormat}`)
            const cacheUrl = `https://wsrv.nl/?w=${shrinkWidth}&output=${outputFormat}&url=${escapedUrl}${filenameParam}`
            return `[[&ref(${cacheUrl},${displayWidth})${linkType}${url}]]`
        }).filter(Boolean).join('\n')
        if (text) text += '\n'
        return text
    }, (
        `容量の大きい画像を軽量化して表示するタグに変換する (1行＝1 URL、wsrv.nl を利用)

        https://image01.seesaawiki.jp/h/v/xxx/XXXXXXXXXX.png
        ↓↓↓ 幅240pxに縮小 (png→jpg)
        [[&ref(https://wsrv.nl/?w=240&output=jpg&url=https://image01.seesaawiki.jp/h/v/xxx/XXXXXXXXXX.png,100%)>https://image01.seesaawiki.jp/h/v/xxx/XXXXXXXXXX.png]]`.replace(/^[ \t]+/gm, '')
    ))

    if (this.membersData) {
        const repr = Object.getOwnPropertyNames(this.membersData)[0]
        addSimpleProcessor('liveeurl', 'YouTube配信リンク', (text) => {
            for (const key in this.membersData) {
                const reftag = `[[${this.membersData[key].name}>>https://www.youtube.com/channel/${this.membersData[key].yt}/live]]`
                // text = text.replaceAll(this.membersData[key].name, reftag);
                text = text.split(this.membersData[key].name).join(reftag)
            }
            return text
        }, (
            `メンバー名をYouTube配信へのリンクに変換する

            ${this.membersData[repr].name}
            ↓↓↓
            [[${this.membersData[repr].name}>>https://www.youtube.com/channel/${this.membersData[repr].yt}/live]]`.replace(/^[ \t]+/gm, '')
        ))
    }

    activateTool(localStorage.getItem('active_tool') || 'htmlref')

    function initEditingTools () {
        const style = `
          .tools-area .toggle-button {
            border: none;
            width: 24px;
            height: 24px;
            margin-right: 10px;
            vertical-align: middle;
            cursor: pointer;
            background-image: url('https://static.seesaawiki.jp/img/usr_second/common/edit/btn_close.gif?0.7.9');
          }
          .tools-area .toggle-button:hover {
            background-image: url('https://static.seesaawiki.jp/img/usr_second/common/edit/btn_close_on.gif?0.7.9');
          }
          .tools-area .toggle-button.open {
            background-image: url('https://static.seesaawiki.jp/img/usr_second/common/edit/btn_open.gif?0.7.9');
          }
          .tools-area .toggle-button.open:hover {
            background-image: url('https://static.seesaawiki.jp/img/usr_second/common/edit/btn_open_on.gif?0.7.9');
          }
          .tools-area > label {
            font-size: 14px;
            font-weight: bold;
            vertical-align: middle;
            cursor: pointer;
          }
          .tools-area .toggle-area {
            display: none;
            margin-top: 5px;
            min-height: 200px;
          }
          .tools-area .toggle-area.open {
            display: flex;
          }
          .tools-area ul.tool-menu {
            width: 150px;
            margin-top: 0;
            margin-bottom: 0;
            margin-right: 5px;
            padding: 0;
          }
          .tools-area ul.tool-menu > li {
            list-style-type: none;
            padding: 3px;
            margin-bottom: 3px;
            font-weight: bold;
            cursor: pointer;
            text-align: center;
            border: 1px solid gray;
          }
          .tools-area ul.tool-menu > li.active {
            border: 1px solid green;
            background-color: #efe;
          }
          .tools-area .tool-box {
            flex: auto;
            border: 1px solid lightgray;
            display: flex;
            flex-direction: column;
          }
          .tools-area .tool-box > .tool-content {
            display: none;
            flex: auto;
          }
          .tools-area .tool-box > .tool-content.show {
            display: block;
          }
          .tools-area .tool-box > .tool-content.flex.show {
            display: flex;
            flex-direction: column;
          }
          .tools-area .tool-content textarea {
            box-sizing: border-box;
            margin: 0;
            width: 100%;
            font-size: 13px;
          }
          .tools-area .tool-options > label {
            display: block;
            margin: 3px;
          }
        `
        const el_style = document.createElement('style')
        el_style.appendChild(document.createTextNode(style))
        document.head.appendChild(el_style)

        const tools_area = document.createElement('div')
        tools_area.addClassName('tools-area')
        tools_area.addClassName('edit-line-3')
        tools_area.addClassName('clearfix')

        const toggle_button = document.createElement('button')
        toggle_button.id = 'tool-area-toggle-button'
        toggle_button.addClassName('toggle-button')
        tools_area.appendChild(toggle_button)

        const label = document.createElement('label')
        label.htmlFor = 'tool-area-toggle-button'
        label.innerText = '編集用ツール'
        tools_area.appendChild(label)

        const toggle_area = document.createElement('div')
        toggle_area.addClassName('toggle-area')
        tools_area.appendChild(toggle_area)

        toggle_button.classList.toggle('open', is_area_open)
        toggle_area.classList.toggle('open', is_area_open)

        toggle_button.addEventListener('click', function (e) {
            is_area_open = !is_area_open
            this.classList.toggle('open', is_area_open)
            toggle_area.classList.toggle('open', is_area_open)
            if (is_area_open) {
                localStorage.setItem('tools_area_open', 'true')
            } else {
                localStorage.removeItem('tools_area_open')
            }
            e.preventDefault()
        }, false)

        const tool_menu = document.createElement('ul')
        tool_menu.addClassName('tool-menu')
        toggle_area.appendChild(tool_menu)

        const tool_box = document.createElement('div')
        tool_box.addClassName('tool-box')
        toggle_area.appendChild(tool_box)

        const preview_area = document.querySelector('div#preview-container')
        preview_area.parentNode.insertBefore(tools_area, preview_area.nextSibling)

        return tools_area
    }

    function addTool (name, label, setup) {
        const tool_menu = tools_area.querySelector('ul.tool-menu')
        const tool_box = tools_area.querySelector('.tool-box')

        const menu_item = document.createElement('li')
        menu_item.dataset.toolName = name
        menu_item.innerText = label
        tool_menu.appendChild(menu_item)

        menu_item.addEventListener('click', function () {
            activateTool(name)
        }, false)

        const tool_content = document.createElement('div')
        tool_content.addClassName('tool-content')
        tool_content.dataset.toolName = name
        tool_box.appendChild(tool_content)

        setup.call(tool_content)
    }

    function addSimpleProcessor (name, label, process, placeholder) {
        addTool(name, label, function () {
            const wrapper = document.createElement('div')
            wrapper.style.flex = 'auto'
            wrapper.style.display = 'flex'
            wrapper.style.flexDirection = 'column'
            wrapper.style.alignItems = 'start'

            const process_btn = document.createElement('button')
            process_btn.style.width = '80px'
            process_btn.innerText = '処理'
            wrapper.appendChild(process_btn)

            const textbox = document.createElement('textarea')
            textbox.style.flex = 'auto'
            if (placeholder) {
                textbox.placeholder = placeholder
            }
            wrapper.appendChild(textbox)

            process_btn.addEventListener('click', function (e) {
                e.preventDefault()
                textbox.value = process(textbox.value)
            })

            this.addClassName('flex')
            this.appendChild(wrapper)
        })
    }

    function activateTool (name) {
        const tool_menu = tools_area.querySelector('ul.tool-menu')
        const tool_box = tools_area.querySelector('.tool-box')

        // for (const menu_item of tool_menu.childNodes) {
        for (let i = 0, nodes = tool_menu.childNodes; i < nodes.length; i++) {
            const menu_item = nodes[i]
            if (menu_item.dataset.toolName === name) {
                menu_item.addClassName('active')
            } else {
                menu_item.removeClassName('active')
            }
        }

        // for (const tool_content of tool_box.childNodes) {
        for (let i = 0, nodes = tool_box.childNodes; i < nodes.length; i++) {
            const tool_content = nodes[i]
            if (tool_content.dataset.toolName === name) {
                tool_content.addClassName('show')
            } else {
                tool_content.removeClassName('show')
            }
        }

        localStorage.setItem('active_tool', name)
    }

    function parseURL (url) {
        try {
            return new URL(url)
        } catch (e) {
            return null
        }
    }

} // setupEditingTools

//----------
// 文法チェッカー (編集画面)
//----------

setupSyntaxChecker () {

    const edit_box = document.querySelector('textarea#content')
    const info = document.createElement('ul')
    const options = {}

    initSyntaxChecker()

    window.addEventListener('option-changed', reloadSettings)

    function initSyntaxChecker () {
        const style = `
          ul#syntax-info {
            max-height: 120px;
            overflow-y: scroll;
            background-color: white;
            border: #b2b2b2 solid 1px;
            border-top: none;
            padding: 5px;
            margin: 0;
            list-style-position: inside;
          }
          ul#syntax-info > li {
            background-color: #eee;
            padding: 2px;
            margin: 0;
            margin-bottom: 4px;
          }
          ul#syntax-info > li.level-info {
            background-color: #eef;
          }
          ul#syntax-info > li.level-warning {
            background-color: #ffc;
          }
          ul#syntax-info > li.level-error {
            background-color: #fdd;
          }
        `
        const el_style = document.createElement('style')
        el_style.appendChild(document.createTextNode(style))
        document.head.appendChild(el_style)

        const wiki_form = document.querySelector('form#wiki-form')
        const edit_inner = edit_box.parentElement
        const edit_outer = edit_inner.parentElement

        info.id = 'syntax-info'
        edit_outer.appendChild(info)

        setupObserver(checkSyntaxAndDisplay)
        reloadSettings()
        checkSyntaxAndDisplay()

        wiki_form.addEventListener('submit', function (e) {
            if (!options.enabled) return
            const has_error = Array.prototype.findIndex.call(info.childNodes, (e) => e.hasClassName('level-error')) >= 0
            if (has_error) {
                const r = confirm('文法エラーがあります。そのまま保存しますか？')
                if (!r) {
                    e.preventDefault()
                    return false
                }
            }
        }, false)
    }

    function setupObserver (trigger) {
        const delay_trigger = (function () {
            let handle = null
            return function (delay) {
                if (handle) {
                    clearTimeout(handle)
                    handle = null
                }
                handle = setTimeout(function () {
                    handle = null
                    trigger()
                }, delay)
            }
        })()
        edit_box.addEventListener('change', function () {
            delay_trigger(100)
        })
        edit_box.addEventListener('keyup', function () {
            delay_trigger(500)
        })
    }

    function reloadSettings () {
        let changed = false
        function load (name, item_name, default_) {
            const val = !!JSON.parse(localStorage.getItem(item_name) || String(default_))
            if (val !== options[name]) {
                changed = true
            }
            options[name] = val
        }
        load('enabled', 'tool.syntax_check.enabled', false)
        load('box', 'tool.syntax_check.box.enabled', true)
        load('table', 'tool.syntax_check.table.enabled', true)
        load('folding', 'tool.syntax_check.folding.enabled', true)
        load('anchor', 'tool.syntax_check.anchor.enabled', true)
        load('shorturl', 'tool.syntax_check.shorturl.enabled', true)
        load('trailing_space', 'tool.syntax_check.trailing_space.enabled', true)
        if (changed) {
            checkSyntaxAndDisplay()
        }
    }

    function checkSyntaxAndDisplay () {
        clearLines()
        if (!options.enabled) return

        const errors = []
        checkSyntax(edit_box.value, (msg, line, level) => errors.push([msg, line, level]))
        errors.sort((a, b) => a[1].start - b[1].start)
        for (const [msg, line, level] of errors) {
            addLine(msg, line, level)
        }
    }

    function checkSyntax (wiki, notifyError) {
        const state = {}

        const lines = wiki.split(/\n/).map((x, i) => ({
            text: x,
            lineno: i + 1,
            type: null,
            next: null,
            prev: null,
            parent: null
        }))

        let start = 0
        let end = -1
        for (const line of lines) {
            const i = line.lineno - 1
            start = end + 1
            end = start + line.text.length
            line.start = start
            line.end = end
            line.next = lines[i + 1] || null
            line.prev = lines[i - 1] || null
        }

        state.incode = false
        for (const line of lines) {
            const text = line.text
            if (state.incode) {
                if (text.startsWith('||=')) {
                    line.type = 'box-end'
                    state.incode = false
                } else {
                    line.type = 'box-content'
                }
            } else if (text.startsWith('||=')) {
                line.type = 'box-end-bad'
            } else if (text.startsWith('=|')) {
                line.type = 'box-start'
                state.incode = true
            } else if (text.startsWith('//')) {
                line.type = 'comment'
                if (text.startsWith('//|')) {
                    line.table = true
                }
            } else if (text.startsWith('{|')) {
                line.type = 'table-start'
                line.table = true
            } else if (text.startsWith('|}')) {
                line.type = 'table-end'
                line.table = true
            } else if (text.startsWith('|')) {
                line.type = 'table-content'
                line.table = true
            } else if (text === '') {
                line.type = 'empty'
            } else if (text.startsWith('[+]') || text.startsWith('[-]')) {
                line.type = 'fold-start'
            } else if (text.startsWith('[END]')) {
                line.type = 'fold-end'
            } else if (text.startsWith('#include')) {
                line.type = 'include'
            } else if (text.startsWith('*')) {
                line.type = 'heading'
            }
            if (!state.incode && !text.startsWith('//')) {
                // XXX: look-behind is not supported
                // line.anchors = text.match(/(?<=&aname\()[^\)]*(?=\))/g);
                line.anchors = []
                const pattern = /&aname\(([^)]*)\)/g
                let match
                while ((match = pattern.exec(text)) !== null) {
                    line.anchors.push(match[1])
                }
                if (line.anchors.length === 0) {
                    line.anchors = null
                }
            }
        }

        // BOX記法
        if (options.box) {
            for (let line = lines[0]; line; line = line.next) {
                if (line.type === 'box-end-bad') {
                    notifyError('対応するBOX開始タグがありません。', line, 'error')
                }
            }
            const lastline = lines[lines.length - 1]
            if (lastline.type === 'box-start' || lastline.type === 'box-content') {
                let line = lastline
                while (line.type !== 'box-start') {
                    line = line.prev
                }
                notifyError('対応するBOX終了タグがありません。', line, 'error')
            }
        }

        // 折りたたみ記法
        if (options.folding) {
            state.fold_level = 0
            state.folds = []
            for (let line = lines[0]; line; line = line.next) {
                if (line.type === 'fold-start') {
                    state.fold_level++
                    state.folds.push(line)
                } else if (line.type === 'fold-end') {
                    if (state.fold_level > 0) {
                        state.fold_level--
                        state.folds.pop()
                    } else {
                        notifyError('対応する折りたたみ開始タグがありません。', line, 'error')
                    }
                }
            }
            for (const line of state.folds) {
                notifyError('対応する折りたたみ終了タグがありません。', line, 'error')
            }
        }

        // テーブル
        if (options.table) {
            state.intable = false
            state.table_has_start = false
            state.table_end = false
            for (let line = lines[0]; line; line = line.next) {
                if (state.intable) {
                    if (line.type === 'table-start') {
                        state.table_has_start = true
                        if (line.prev.type === 'table-start') {
                            notifyError('無効なテーブル開始タグです。指定は無視されます。', line, 'warning')
                        } else {
                            notifyError('空行がありません。指定は無視され、テーブルは連結されます。', line, 'error')
                        }
                    } else if (line.type === 'table-content') {
                        if (state.table_end) {
                            notifyError('空行がありません。テーブルは連結されます。', line, 'error')
                        } else {
                            // valid
                        }
                    } else if (line.type === 'comment' && line.text.startsWith('//|')) {
                        line.table_error = true
                        if (!line.prev.table_error) {
                            let splitted = false
                            for (let next = line.next; next; next = next.next) {
                                if (next.type === 'comment') continue
                                if (next.type === 'table-content') {
                                    splitted = true
                                }
                                break
                            }
                            if (splitted) {
                                notifyError('テーブル行がコメントアウトされています。テーブルは分断されます。', line, 'error')
                            } else {
                                notifyError('テーブル行がコメントアウトされています。', line, 'warning')
                            }
                        }
                    } else if (line.type === 'table-end') {
                        if (state.table_has_start) {
                            if (state.table_end) {
                                notifyError('無効なテーブル終了タグです。', line, 'warning')
                            } else {
                                state.table_end = true
                            }
                        } else {
                            notifyError('無効なテーブル終了タグです。', line, 'warning')
                        }
                    } else {
                        if (state.table_has_start && !state.table_end) {
                            state.intable = false
                            notifyError('テーブル終了タグがありません。', line.prev, 'warning')
                        } else {
                            state.intable = false
                        }
                    }
                } else {
                    if (line.type === 'table-start') {
                        state.intable = true
                        state.table_has_start = true
                        state.table_end = false
                    } else if (line.type === 'table-content') {
                        state.intable = true
                        state.table_has_start = false
                        state.table_end = false
                    } else if (line.type === 'table-end') {
                        notifyError('無効なテーブル終了タグです。', line, 'warning')
                    } else {
                        // valid
                    }
                }
                if (!line.next && state.intable && state.table_has_start && !state.table_end) {
                    notifyError('テーブル終了タグがありません。', line, 'warning')
                }
            }
        }

        // アンカー
        if (options.anchor) {
            const all_anchors = {}
            for (let line = lines[0]; line; line = line.next) {
                if (line.anchors) {
                    for (const name of line.anchors) {
                        if (name in all_anchors) {
                            notifyError('アンカー名が重複しています。ページ内リンクとして使用する場合は対処が必要です。', line, 'warning')
                        }
                        all_anchors[name] = true
                    }
                    if (line.type === 'heading') {
                        notifyError('見出しにアンカーが使用されています。', line, 'warning')
                    }
                }
            }
        }

        // 短縮URL
        if (options.shorturl) {
            for (let line = lines[0]; line; line = line.next) {
                if (/https?:\/\/(t\.co|bit\.ly)\//.test(line.text)) {
                    notifyError('短縮URLが使用されています。', line, 'warning')
                }
            }
        }

        // 行末半角スペース
        if (options.trailing_space) {
            for (let line = lines[0]; line; line = line.next) {
                if (line.text.endsWith(" ")) {
                    notifyError('行末に半角スペースがあります。', line, 'warning')
                }
            }
        }
    }

    function clearLines () {
        while (info.firstChild) {
            info.removeChild(info.firstChild)
        }
    }

    function addLine (message, line, level) {
        const lineno = line.lineno
        const start = line.start
        const end = line.end
        const item = document.createElement('li')
        item.addClassName(`level-${level}`)
        const link = document.createElement('a')
        link.innerText = 'L.' + lineno
        link.style.marginRight = '10px'
        link.href = '#L' + lineno
        link.addEventListener('click', function (e) {
            e.preventDefault()
            edit_box.scroll(0, calculateScrollHeight(start))
            edit_box.setSelectionRange(start, end)
            edit_box.focus()
        }, false)
        const text = document.createElement('span')
        text.innerText = message
        item.appendChild(link)
        item.appendChild(text)
        info.appendChild(item)
    }

    function calculateScrollHeight (start) {
        const clone = edit_box.cloneNode()
        clone.id = ''
        clone.style.visibility = 'hidden'
        clone.style.zIndex = '-1'
        clone.style.position = 'absolute'
        clone.style.height = '1px'
        clone.style.width = `${edit_box.clientWidth}px`
        clone.style.overflowY = 'hidden'
        clone.value = edit_box.value.substring(0, start)
        edit_box.parentNode.appendChild(clone)
        const y = Math.max(0, clone.scrollHeight - edit_box.clientHeight / 2)
        clone.remove()
        return y
    }

} // setupSyntaxChecker

//----------
// メンバー情報 (編集ツールで使用)
//----------

initMembersData () {
    if (this.wikiId === 'hololivetv') {
        this.membersData = {
            sora:       {yt: 'UCp6993wxpyDPHUpavwDFqgg', bi: '8899503', tw: '', name: 'ときのそら', tag: '#ときのそら生放送', handle:'@TokinoSora'},
            roboco:     {yt: 'UCDqI2jOz0weumE8s7paEk6g', bi: '4664126', tw: '', name: 'ロボ子さん', tag: '#ロボ子生放送', handle:'@Robocosan'},
            miko:       {yt: 'UC-hM6YJuNYVAmUWxeIr9FeA', bi: '21144047', tw: '', name: 'さくらみこ', tag: '#みこなま', handle:'@SakuraMiko'},
            suisei:     {yt: 'UC5CwaMl1eIgY8h02uZw7u8A', bi: '190577', tw: '', name: '星街すいせい', tag: '#ほしまちすたじお', handle:'@HoshimachiSuisei'},
            azki:       {yt: 'UC0TXe_LYZ4scaW2XMyi5_kw', bi: '21267062', tw: '', name: 'AZKi', tag: '#AZKi生放送・#あずきんち', handle:'@AZKi'},

            mel:        {yt: 'UCD8HOxPs4Xvsm8H0ZxXGiBw', bi: '21131813', tw: '', name: '夜空メル', tag: '#メル生放送', handle:'@YozoraMel'},
            rose:       {yt: 'UCFTLzh12_nrtzqBPsTCqenA', bi: '21219990', tw: '', name: 'アキロゼ', tag: '#アキびゅーわーるど', handle:'@AkiRosenthal'},
            haato:      {yt: 'UC1CfXB_kRs3C-zaeTG3oGyg', bi: '14275133', tw: '', name: '赤井はあと', tag: '#はあちゃまなう', handle:'@AkaiHaato'},
            fubuki:     {yt: 'UCdn5BQ06XqgXoAxIhbqw5Rg', bi: '11588230', tw: '', name: '白上フブキ', tag: '#フブキch', handle:'@ShirakamiFubuki'},
            matsuri:    {yt: 'UCQ0UDLQCjY0rmuxCDE38FGg', bi: '13946381', tw: '', name: '夏色まつり', tag: '#夏まつch', handle:'@NatsuiroMatsuri'},

            aqua:       {yt: 'UC1opHUrw8rvnsadT-iGp7Cg', bi: '14917277', tw: '', name: '湊あくあ', tag: '#湊あくあ生放送', handle:'@MinatoAqua'},
            shion:      {yt: 'UCXTpFs_3PqI41qX2d9tL2Rw', bi: '21132965', tw: '', name: '紫咲シオン', tag: '#紫咲シオン', handle:'@MurasakiShion'},
            nakiri:     {yt: 'UC7fk0CB07ly8oSl0aqKkqFg', bi: '21130785', tw: '', name: '百鬼あやめ', tag: '#百鬼あやめch', handle:'@NakiriAyame'},
            choco:      {yt: 'UC1suqwovbL1kzsoaZgFZLKg', bi: '21107534', tw: '', name: '癒月ちょこ', tag: '#癒月診療所', handle:'@YuzukiChoco'},
            subaru:     {yt: 'UCvzGlP9oQwU--Y0r9id_jnA', bi: '21129632', tw: '', name: '大空スバル', tag: '#生スバル', handle:'@OozoraSubaru'},

            mio:        {yt: 'UCp-5t9SrOQwXMU7iIjQfARg', bi: '21133979', tw: '', name: '大神ミオ', tag: '#ミオかわいい', handle:'@OokamiMio'},
            okayu:      {yt: 'UCvaTdHTWBGv3MKj3KVqJVCw', bi: '21420932', tw: '', name: '猫又おかゆ', tag: '#生おかゆ', handle:'@NekomataOkayu'},
            korone:     {yt: 'UChAnqc_AY5_I3Px5dig3X1Q', bi: '21421141', tw: '', name: '戌神ころね', tag: '#生神もんざえもん', handle:'@InugamiKorone'},

            pekora:     {yt: 'UC1DCedRgGHBdm81E1llLhOQ', bi: '21560356', tw: '', name: '兎田ぺこら', tag: '#ぺこらいぶ', handle:'@usadapekora'},
            rushia:     {yt: 'UCl_gCybOJRIgOXw6Qb4qJzQ', bi: '21545232', tw: '', name: '潤羽るしあ', tag: '#るしあらいぶ', handle:'@UruhaRushia'},
            flare:      {yt: 'UCvInZx9h3jC2JzsIzoOebWg', bi: '21572617', tw: '', name: '不知火フレア', tag: '#フレアストリーム', handle:'@ShiranuiFlare'},
            noel:       {yt: 'UCdyqAaZDKHXg4Ahi7VENThQ', bi: '21583736', tw: '', name: '白銀ノエル', tag: '#ノエルーム', handle:'@ShiroganeNoel'},
            marine:     {yt: 'UCCzUftO8KOVkV4wQG1vkUvg', bi: '21584153', tw: '', name: '宝鐘マリン', tag: '#マリン航海記', handle:'@HoushouMarine'},

            kanata:     {yt: 'UCZlDXzGoo7d44bwdNObFacg', bi: '21752681', tw: '', name: '天音かなた', tag: '#天界学園放送部', handle:'@AmaneKanata'},
            coco:       {yt: 'UCS9uQI-jC3DE0L4IpXyvr6w', bi: '21752686', tw: '', name: '桐生ココ', tag: '#ココここ', handle:'@KiryuCoco'},
            watame:     {yt: 'UCqm3BQLlJfvkTsX_hvm0UmA', bi: '21752694', tw: '', name: '角巻わため', tag: '#ドドドライブ', handle:'@TsunomakiWatame'},
            towa:       {yt: 'UC1uv2Oq6kNxgATlCiez59hw', bi: '21752710', tw: '', name: '常闇トワ', tag: '#トワイライヴ', handle:'@TokoyamiTowa'},
            luna:       {yt: 'UCa9Y57gfeY0Zro_noHRVrnw', bi: '21752719', tw: '', name: '姫森ルーナ', tag: '#なのらいぶ', handle:'@HimemoriLuna'},

            lamy:       {yt: 'UCFKOVgVbGmX65RxO3EtH3iw', bi: '', tw: '', name: '雪花ラミィ', tag: '#らみらいぶ', handle:'@YukihanaLamy'},
            nene:       {yt: 'UCAWSyEs_Io8MtpY3m-zqILA', bi: '', tw: '', name: '桃鈴ねね', tag: '#ねねいろらいぶ', handle:'@MomosuzuNene'},
            botan:      {yt: 'UCUKD-uaobj9jiqB-VXt71mA', bi: '', tw: '', name: '獅白ぼたん', tag: '#ぐうたらいぶ', handle:'@ShishiroBotan'},
            aloe:       {yt: 'UCgZuwn-O7Szh9cAgHqJ6vjw', bi: '', tw: '', name: '魔乃アロエ', tag: '#魔のらいぶ', handle:'@ManoAloe'},
            polka:      {yt: 'UCK9V2B22uJYu3N7eR_BT9QA', bi: '', tw: '', name: '尾丸ポルカ', tag: '#ポルカ公演中', handle:'@OmaruPolka'},

            laplus:     {yt: 'UCENwRMx5Yh42zWpzURebzTw', bi:'', tw: '', name: 'ラプラス・ダークネス', tag: '', handle:'@LaplusDarknesss'},
            lui:        {yt: 'UCs9_O1tRPMQTHQ-N_L6FU2g', bi:'', tw: '', name: '鷹嶺ルイ', tag: '', handle:'@TakaneLui'},
            koyori:     {yt: 'UC6eWCld0KwmyHFbAqK3V-Rw', bi:'', tw: '', name: '博衣こより', tag: '', handle:'@HakuiKoyori'},
            chloe:      {yt: 'UCIBY1ollUsauvVi4hW4cumw', bi:'', tw: '', name: '沙花叉クロヱ', tag: '', handle:'@SakamataChloe'},
            iroha:      {yt: 'UC_vMYWcDjmfdpH6r4TTn1MQ', bi:'', tw: '', name: '風真いろは', tag: '', handle:'@kazamairoha'},

            risu:       {yt: 'UCOyYb1c43VlX9rc_lT6NKQw', bi:'', tw:'', name: 'Ayunda Risu', tag: '', handle:'@AyundaRisu'},
            moona:      {yt: 'UCP0BspO_AMEe3aQqqpo89Dg', bi:'', tw:'', name: 'Moona Hoshinova', tag: '', handle:'@MoonaHoshinova'},
            iofi:       {yt: 'UCAoy6rzhSf4ydcYjJw3WoVg', bi:'', tw:'', name: 'Airani Iofifteen', tag: '', handle:'@AiraniIofifteen'},

            ollie:      {yt: 'UCYz_5n-uDuChHtLo7My1HnQ', bi:'', tw:'', name: 'Kureiji Ollie', tag: '', handle:'@KureijiOllie'},
            anya:       {yt: 'UC727SQYUvx5pDDGQpTICNWg', bi:'', tw:'', name: 'Anya Melfissa', tag: '', handle:'@AnyaMelfissa'},
            reine:      {yt: 'UChgTyjG-pdNvxxhdsXfHQ5Q', bi:'', tw:'', name: 'Pavolia Reine', tag: '', handle:'@PavoliaReine'},

            zeta:       {yt: 'UCTvHWSfBZgtxE4sILOaurIQ', bi:'', tw:'', name: 'Vestia Zeta', tag: '', handle:'@VestiaZeta'},
            kaela:      {yt: 'UCZLZ8Jjx_RN2CXloOmgTHVg', bi:'', tw:'', name: 'Kaela Kovalskia', tag: '', handle:'@KaelaKovalskia'},
            kobo:       {yt: 'UCjLEmnpCNeisMxy134KPwWw', bi:'', tw:'', name: 'Kobo Kanaeru', tag: '', handle:'@KoboKanaeru'},

            indonesia:  {yt: 'UCfrWoRGlawPQDQxxeIDRP0Q', bi:'', tw:'', name: 'hololive Indonesia', tag: '', handle:'@hololiveIndonesia'},

            calliope:   {yt: 'UCL_qhgtOy0dy1Agp8vkySQg', bi:'', tw:'', name: 'Mori Calliope', tag: '', handle:'@MoriCalliope'},
            kiara:      {yt: 'UCHsx4Hqa-1ORjQTh9TYDhww', bi:'', tw:'', name: 'Takanashi Kiara', tag: '', handle:'@TakanashiKiara'},
            inanis:     {yt: 'UCMwGHR0BTZuLsmjY_NT5Pwg', bi:'', tw:'', name: "Ninomae Ina'nis", tag: '', handle:'@NinomaeInanis'},
            gura:       {yt: 'UCoSrY_IQQVpmIRZ9Xf-y93g', bi:'', tw:'', name: 'Gawr Gura', tag: '', handle:'@GawrGura'},
            amelia:     {yt: 'UCyl1z3jo3XHR1riLFKG5UAg', bi:'', tw:'', name: 'Watson Amelia', tag: '', handle:'@WatsonAmelia'},

            irys:       {yt: 'UC8rcEBzJSleTkf_-agPM20g', bi:'', tw:'', name: 'IRyS', tag: '', handle:'	@IRyS'},
            sana:       {yt: 'UCsUj0dszADCGbF3gNrQEuSQ', bi:'', tw:'', name: 'Tsukumo Sana', tag: '', handle:'@TsukumoSana'},
            fauna:      {yt: 'UCO_aKKYxn4tvrqPjcTzZ6EQ', bi:'', tw:'', name: 'Ceres Fauna', tag: '', handle:'@CeresFauna'},
            kronii:     {yt: 'UCmbs8T6MWqUHP1tIQvSgKrg', bi:'', tw:'', name: 'Ouro Kronii', tag: '', handle:'@OuroKronii'},
            mumei:      {yt: 'UC3n5uGu18FoCy23ggWWp8tA', bi:'', tw:'', name: 'Nanashi Mumei', tag: '', handle:'@NanashiMumei'},
            hakos:      {yt: 'UCgmPnx-EEeOrZSg5Tiw7ZRQ', bi:'', tw:'', name: 'Hakos Baelz', tag: '', handle:'@HakosBaelz'},

            shiori:	    {yt: 'UCgnfPPb9JI3e9A4cXHnWbyg', bi:'', tw:'', name:'Shiori Novella', tag: '', handle:'@ShioriNovella'},
            bijou:	    {yt: 'UC9p_lqQ0FEDz327Vgf5JwqA', bi:'', tw:'', name:'Koseki Bijou', tag: '', handle:'@KosekiBijou'},
            nerissa:	{yt: 'UC_sFNM0z0MWm9A6WlKPuMMg', bi:'', tw:'', name:'Nerissa Ravencroft', tag: '', handle:'@NerissaRavencroft'},
            fuwawa:	    {yt: 'UCt9H_RpQzhxzlyBxFqrdHqA', bi:'', tw:'', name:'Fuwawa Abyssgard', tag: '', handle:''},
            mococo:	    {yt: 'UCt9H_RpQzhxzlyBxFqrdHqA', bi:'', tw:'', name:'Mococo Abyssgard', tag: '', handle:''},
            fuwamoco:	{yt: 'UCt9H_RpQzhxzlyBxFqrdHqA', bi:'', tw:'', name:'FUWAMOCO', tag: '', handle:'@FUWAMOCOch'},

            elizabeth:	{yt: 'UCW5uhrG1eCBYditmhL0Ykjw', bi:'', tw:'', name:'Elizabeth Rose Bloodflame', tag: '', handle:'@holoen_erbloodflame'},
            gigi:       {yt: 'UCDHABijvPBnJm7F-KlNME3w', bi:'', tw:'', name:'Gigi Murin', tag: '', handle:'@holoen_gigimurin'},
            cecilia:	{yt: 'UCvN5h1ShZtc7nly3pezRayg', bi:'', tw:'', name:'Cecilia Immergreen', tag: '', handle:'@holoen_ceciliaimmergreen'},
            raora:	    {yt: 'UCl69AEx4MdqMZH7Jtsm7Tig', bi:'', tw:'', name:'Raora Panthera', tag: '', handle:'@holoen_raorapanthera'},

            english:    {yt: 'UCotXwY6s8pWmuWd_snKYjhg', bi:'', tw:'', name: 'hololive English', tag: '', handle:'@hololiveEnglish'},

            ao:	        {yt: 'UCMGfV7TVTmHhEErVJg1oHBQ',bi:'', tw:'', name:'火威青', tag: '', handle:'@HiodoshiAo'},
            kanade:	    {yt: 'UCWQtYtq9EOB4-I5P-3fh8lA',bi:'', tw:'', name:'音乃瀬奏', tag: '', handle:'@OtonoseKanade'},
            ririka:	    {yt: 'UCtyWhCj3AqKh2dXctLkDtng',bi:'', tw:'', name:'一条莉々華', tag: '', handle:'@IchijouRirika'},
            raden:    	{yt: 'UCdXAk5MpyLD8594lm_OvtGQ',bi:'', tw:'', name:'儒烏風亭らでん', tag: '', handle:'@JuufuuteiRaden'},
            hajime:	    {yt: 'UC1iA6_NT4mtAcIII6ygrvCw',bi:'', tw:'', name:'轟はじめ', tag: '', handle:'@TodorokiHajime'},
            dev_is:	    {yt: 'UC10wVt6hoQiwySRhz7RdOUA',bi:'', tw:'', name:'DEV_IS', tag: '', handle:'@hololiveDEV_IS'},

            riona:      {yt: 'UC9LSiN9hXI55svYEBrrK-tw',bi:'', tw:'isakiriona', name:'響咲リオナ', tag: '', handle:'@IsakiRiona'},
            niko:    	{yt: 'UCuI_opAVX6qbxZY-a-AxFuQ',bi:'', tw:'koganeiniko', name:'虎金妃笑虎', tag: '', handle:'@KoganeiNiko'},
            su:	        {yt: 'UCjk2nKmHzgH5Xy-C5qYRd5A',bi:'', tw:'mizumiya_su', name:'水宮枢', tag: '', handle:'@MizumiyaSu'},
            chihaya:	{yt: 'UCKMWFR6lAstLa7Vbf5dH7ig',bi:'', tw:'rindochihaya', name:'輪堂千速', tag: '', handle:'@RindoChihaya'},
            vivi:    	{yt: 'UCGzTVXqMQHa4AgJVJIVvtDQ',bi:'', tw:'kikiraravivi', name:'綺々羅々ヴィヴィ', tag: '', handle:'@KikiraraVivi'},
            flowglow:	{yt: 'UCu2n3qHuOuQIygREMnWeQWg',bi:'', tw:'', name:'FLOW GLOW', tag: '', handle:'@DEV_IS_FLOWGLOW'},
            ankimo:     {yt: 'UCGSOfFtVCTBfmGxHK5OD8ag',bi:'', tw:'', name:'あん肝', tag: '#あん肝', handle:''},

            chocosub:   {yt: 'UCp3tgHXw_HI0QMk1K8qh3gQ', bi: '', tw: '', name: 'ちょこSub', tag: '#癒月診療所', handle:'@YuzukiChoco_Sub'},
            //  gamer:      {name: "ホロライブゲーマーズ", handle:''},
            holo:       {yt: 'UCJFZiqLMntJufDCHc6bQixg', bi: '8982686', tw: '', name: 'ホロライブ公式', tag: '#ホロライブ', handle:'@hololive'},
            journey:	{yt: 'UCrEgFGxfrKGyy17V9csSa5w',bi:'', tw:'', name:'Blue Journey', tag: '', handle:'@BlueJourney'}
        }
    } else if (this.wikiId === 'siroyoutuber') {
        this.membersData = {
            siro:       { yt: 'UCLhUvJ_wO9hOvv_yYENu4fQ', tw: 'SIROyoutuber', bl: '21307497', name: '電脳少女シロ', tag: '#シロ生放送' , handle:'@CyberGirlSiro'},
            chieri:     { yt: 'UCP9ZgeIJ3Ri9En69R0kJc9Q', tw: 'chieri_kakyoin', ml: '10596504', name: '花京院ちえり', tag: '#花京院ちえり' , handle:'@ChieriKakyoin'},
            suzu:       { yt: 'UCUZ5AlC3rTlM-rA2cj5RP6w', tw: 'kagura_suzu', ml: '10596385', name: '神楽すず', tag: '#神楽すず' , handle:'@SuzuKagura'},
            pino:       { yt: 'UCMzxQ58QL4NNbWghGymtHvw', tw: 'carro_pino', ml: '10953955', name: 'カルロピノ', tag: '#カルロピノ' , handle:'@Pino_Carro'},
            mememe:     { yt: 'UCz6Gi81kE6p5cdW1rT0ixqw', tw: 'mokomeme_ch', ml: '10596609', name: 'もこ田めめめ', tag: '#もこ田めめめ' , handle:'@MememeMokota'},
            iori:       { yt: 'UCyb-cllCkMREr9de-hoiDrg', tw: 'YamatoIori', ml: '10596535', name: 'ヤマトイオリ', tag: '#ヤマトイオリ' , handle:'@IoriYamato'},

            milk:       { yt: 'UCju7v8SkoWUQ5ITCQwmYpYg', tw: 'milk_merry_', name: 'メリーミルク', tag: '#ひつじさんといっしょ' , handle:'@MerryMilk'},

            milily:     { yt: 'UCSlcMof1GIPvH6H_VcknCbQ', tw: 'Milily_VTuber', name: '七星みりり', tag: '#ななみりライブ' , handle:'@MililyNanahoshi'},
            rikumu:     { yt: 'UCtM5G3bS7zM8bv6p-OwoNTw', tw: 'Rikumu_VTuber', name: 'リクム', tag: '#リクム' , handle:'@Rikumu'},
            rururica:   { yt: 'UCcd4MSYH7bPIBEUqmBgSZQw', tw: 'Rururica_VTuber', name: 'ルルンルルリカ', tag: '#ルルンルーム' , handle:'@RurunRururica'},
            uma:        { yt: 'UC6TyfKcsrPwBsBnx2QobVLQ', tw: 'bayoutuber', name: 'ばあちゃる', tag: '#ばあちゃる' , handle:'@_Ubiba'},
            radio:      { yt: 'UCMzxQ58QL4NNbWghGymtHvw', tw: 'carro_pino', name: 'カルロピノ', tag: '#とりとらじお' , handle:''},
            dot:        { yt: 'UCAZ_LA7f0sjuZ1Ni8L2uITw', tw: 'dotLIVEyoutuber', name: '.LIVE', tag: '#どっとライブ' , handle:'@_dotlive'},

            ame:        { yt: 'UCSiTkTBwIMwsAetwwzgFyBg', bi:'', tw:'', name:'甘噛あめ', tag: '', handle:'@AmagamiAme-my2uv'},
            chihaya:    { yt: 'UCWtr2UnCkvyFZnzKBQqG3lg', bi:'', tw:'', name:'十六夜ちはや', tag: '', handle:'@IzayoiChihaya-oo2mj'},
            misaki:     { yt: 'UCQoK32rBoWhHTBIWOYsYC4Q', bi:'', tw:'', name:'鬼頭みさき', tag: '', handle:'@KitoMisaki-qr8eh'},
            maru:       { yt: 'UCK6vZrTlPNCrWzXHIgwDy4Q', bi:'', tw:'', name:'紅蓮罰まる', tag: '', handle:'@GurenbatsuMaru-qo8ze'},
            setsuna:    { yt: 'UClhLb5qSZy0Gvn3c-HuaInQ', bi:'', tw:'', name:'斜落せつな', tag: '', handle:'@SharakuSetsuna-on7ud'},
            pane:       { yt: 'UCEiB6vkUtWsBwYsAF7ukKXw', bi:'', tw:'', name:'秘間慈ぱね', tag: '', handle:'@HimajiPane-qt3zv'},
            ciel:    	{yt: 'UCyD-4021fig0lxKSYK9DL-g',bi:'', tw:'Kagimiya_ciel', name:'鍵宮シエル', tag: '', handle:'@Ciel.Channel'},
            Pyoco:    	{yt: 'UCP4g36UtLmGuqEUUIPLa1fg',bi:'', tw:'KarasumaPyoco', name:'烏丸ぴょこ', tag: '', handle:'@KarasumaPyoco'},
            kyan:    	{yt: 'UCPxSh63XjfSYJbkBLxM3fSw',bi:'', tw:'kyan_VPI', name:'遠吠きゃん', tag: '', handle:'@ToboeKyan'},
            Belluna:	{yt: 'UCGPSbXH61y4l85L9XTUl2mA',bi:'', tw:'VermouthBelluna', name:'ベルモットベルーナ', tag: '', handle:'@VermouthBelluna'},
            Richa:	    {yt: 'UCsrH_eLD23MzxZAmbGMr0SQ',bi:'', tw:'MargherRicha', name:'まるげりちゃ', tag: '', handle:'@MargherRicha'},
            Neguse:	    {yt: 'UCycU4fDdw0-SXsyjj2tvMVg',bi:'', tw:'WatanukiNeguse', name:'綿貫ねぐせ', tag: '', handle:'@WatanukiNeguse'},
            vpi:        {yt: 'UC7-YM5BhR-FCZloquRE7XGw',bi:'', tw:'', name:'ぶいぱい', tag: '', handle:'@cafeVPI'}
        }
    } else if (this.wikiId === 'noriopro') {
        this.membersData = {
            norioo_: {yt: 'UC8NZiqKx6fsDT3AVcMiVFyA', tw: 'norioo_', name: '犬山たまき', tag: '' },
            mishiro: {yt: 'UCC0i9nECi4Gz7TU63xZwodg', tw: 'mishiro_seiso', name: '白雪みしろ', tag: '' },
            MILK:    {yt: 'UCJCzy0Fyrm0UhIrGQ7tHpjg', tw: 'Enomiya_MILK', name: '愛宮みるく', tag: '' },
            taKUMA:  {yt: 'UCCXME7oZmXB2VFHJbz5496A', tw: 'KUMAgaya_taKUMA', name: '熊谷タクマ', tag: '' },
            yuzuru:  {yt: 'UCle1cz6rcyH0a-xoMYwLlAg', tw: 'Himesaki_yuzuru', name: '姫咲ゆずる', tag: '' },
            kirara:  {yt: 'UCBAeKqEIugv69Q2GIgcH7oA', tw: 'omakirara', name: '逢魔きらら', tag: '' },
            momo:    {yt: 'UCxrmkJf_X1Yhte_a4devFzA', tw: 'kurumizawamomo', name: '胡桃澤もも', tag: '' },
            warabe:  {yt: 'UCLyTXfCZtl7dyhta9Jg3pZg', tw: 'hoozukiwarabe', name: '鬼灯わらべ', tag: '' },
            iroha_:  {yt: 'UCWIPfdcux1WxuX5yZLPJDww', tw: 'inariiroha_', name: '稲荷いろは', tag: '' },
            Reg:     {yt: 'UCuycJ_IsA5ESbTYhe05ozqQ', tw: 'Reg_Lionheart', name: 'レグルシュ・ライオンハート', tag: '' },
            shin:    {yt: 'UCMxIxoMdtcLkZ1wTq7qjztg', tw: 'nekozenoshin', name: '猫瀬乃しん', tag: '' }
        }
    } else if (this.wikiId === 'holostarstv') {
        this.membersData = {
            miyabii:    {yt: 'UC6t3-_N8A6ME1JShZHHqOMw', tw: 'miyabihanasaki', name: '花咲みやび', tag: '' },
            kira:       {yt:'UCEzsociuFqVwgZuMaZqaCsg', tw: 'kagamikirach', name: '鏡見キラ', tag: '' },
            izuru:      {yt: 'UCZgOv3YDEs-ZnZWDYVwJdmA', tw: 'kanadeizuru', name: '奏手イヅル', tag: '' },
            arurandeisu:{yt: 'UCKeAhJvy8zgXWbh9duVjIaQ', tw: 'arurandeisu', name: 'アルランディス', tag: '' },
            rikka:      {yt: 'UC9mf_ZVpouoILRY9NUIaK-w', tw: 'rikkaroid', name: '律可', tag: '' },
            astel:      {yt: 'UCNVEsYbiZjH5QLmGeSgTSzg', tw: 'astelleda', name: 'アステル・レダ', tag: '' },
            temma:      {yt: 'UCGNI4MENvnsymYjKiZwv9eg', tw: 'kishidotemma', name: '岸堂天真', tag: '' },
            roberu:     {yt: 'UCANDOlYTJT7N5jlRC3zfzVA', tw: 'yukokuroberu', name: '夕刻ロベル', tag: '' },
            kaoru:      {yt: 'UCsehvfwaWF6nWuFnXI0AqZQ', tw: 'tsukishitakaoru', name: '月下カオル', tag: '' },
            shien:      {yt: 'UChSvpZYRPh0FvG4SJGSga3g', tw: 'kageyamashien', name: '影山シエン', tag: '' },
            oga:        {yt:'UCwL7dgTxKo8Y4RFIKWaf8gA', tw: 'aragamioga', name: '荒咬オウガ', tag: '' },
            fuma:       {yt:'UCc88OV45ICgHbn3ZqLLb52w', tw: 'yatogamifuma', name: '夜十神封魔', tag: '' },
            uyu:        {yt:'UCgRqGV1gBf2Esxh0Tz1vxzw', tw: 'utsugiuyu', name: '羽継烏有', tag: '' },
            gamma:      {yt: 'UCkT1u65YS49ca_LsFwcTakw', tw: 'hizakigamma', name: '緋崎ガンマ', tag: '' },
            rio:        {yt:'UCdfMHxjcCc2HSd9qFvfJgjg', tw: 'minaserioch', name: '水無世燐央', tag: '' },

            altare:     {yt: 'UCyxtGMdWlURZ30WSnEjDOQw', tw: 'regisaltare', name: 'Regis Altare', tag: '' },
            dezmond:    {yt: 'UC7MMNHR-kf9EN1rXiesMTMw', tw: 'magnidezmond', name: 'Magni Dezmond', tag: '' },
            syrios:     {yt: 'UC2hx0xVkMoHGWijwr_lA01w', tw: 'axelsyrios', name: 'Axel Syrios', tag: '' },
            vesper:     {yt: 'UCDRWSO281bIHYVi-OV3iFYA', tw: 'noirvesper_en', name: 'Noir Vesper', tag: '' },
            holostarstv:{yt: 'UCWsfcksUUpoEvhia0_ut0bA', tw: 'holostarstv', name: 'ホロスターズ公式', tag: '' }
        }
    } else if (this.wikiId === 'ui_shig') {
        this.membersData = {
            ui:         {yt: 'UCt30jJgChL8qeT9VPadidSw', tw: '', name: 'しぐれうい', tag: '', handle:'@ui_shig'},
            voisona:    {yt: 'UCoPUMQH-DiKlaJu1E_Sloqw', tw: '', name: 'VoiSona 雨衣', tag: '', handle:'@ui_roid'}
        }
    } else {
        this.membersData = null
    }
} // initMembersData

//----------
// その他
//----------

// Wiki文法の記号類を実体参照に変換
static escapeWikiComponents (text) {
    return text.replace(/[#!%&'()*+,.:=>@[\]^_|~-]/g, (v) => ('&#' + v.codePointAt(0) + ';'))
} // escapeWikiComponents

// 要素の順番を比較する
static compareNodeOrder (e1, e2) {
    const path1 = []
    for (let e = e1.parentElement; e; e = e.parentElement) {
        path1.unshift(e)
    }
    for (let p2 = e2; p2.parentElement; p2 = p2.parentElement) {
        const commonAncestor = p2.parentElement
        if (path1.includes(commonAncestor)) {
            const p1 = path1[path1.indexOf(commonAncestor) + 1]
            if (!p1) break
            const childNodes = Array.from(commonAncestor.childNodes)
            const i1 = childNodes.indexOf(p1)
            const i2 = childNodes.indexOf(p2)
            if (i1 === -1 || i2 === -1 || i1 === i2) break
            return i1 < i2 ? -1 : 1
        }
    }
    return 0
} // compareNodeOrder

} // class WikiExtension

// URLSearchParams に対応していないブラウザ用
class MyURLSearchParams {

    constructor (search) {
        this.params = new Map()
        this._readOnly = false
        if (search == null) {
            return
        }
        if (search.startsWith('?')) {
            search = search.substring(1)
        }
        for (const param of search.split('&')) {
            const sep = param.indexOf('=')
            let key = param
            let value = ''
            if (sep >= 0) {
                key = param.substring(0, sep)
                value = param.substring(sep + 1)
            }
            if (key) {
                value = value.replace(/%(?![0-9a-fA-F]{2})/g, "%25")
                this.params[decodeURIComponent(key)] = decodeURIComponent(value)
            }
        }
    }

    get (key) {
        return this.params[key]
    }

    has (key) {
        return this.params.hasOwnProperty(key)
    }

    set (key, value) {
        if (this._readOnly) {
            throw new Error('read only param')
        }
        this.params[key] = value
    }

    delete (key) {
        if (this._readOnly) {
            throw new Error('read only param')
        }
        delete this.params[key]
    }

    forEach (fn) {
        for (const key in this.params) {
            fn(this.params[key], key)
        }
    }

    toString () {
        const keys = Object.keys(this.params)
        if (keys.length === 0) {
            return ''
        }
        return '?' + keys.map((k) => {
            return encodeURIComponent(k) + '=' + encodeURIComponent(this.params[k])
        }).join('&')
    }

    freeze () {
        this._readOnly = true
    }

} // class MyURLSearchParams

// Wiki拡張を適用
window.wikiExtension = new WikiExtension()

})()
