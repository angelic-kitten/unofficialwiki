function getParams(jump_to_anchor) {
    const url = new URL(window.location.href);
    const hash = url.hash;
    const params = url.searchParams;

    const sep = hash.indexOf("?");
    if (sep > -1) {
        const hashParams = new URLSearchParams(hash.substring(sep));
        hashParams.forEach((val, key) => {
            params.set(key, val);
        });
        const aname = hash.substring(1, sep);
        if (aname && jump_to_anchor) {
            const anchor = document.getElementById(aname) || [...document.querySelectorAll("a[name]")].find((e)=>(e.name == aname));
            if (anchor) {
                //anchor.scrollIntoView();
                window.scrollTo(0, anchor.offsetTop - 40);
            }
        }
    }

    return params;
}

function applyFilter(idx, keyword) {
    const table = $("table.filter").eq(idx);
    const input = $(`#table-filter-${idx}`);
    if (!input) return;
    table.addClass("regex");
    input.val(keyword).change();
}

document.addEventListener('DOMContentLoaded', function() {
    const title = document.title;
    const params = getParams(true);
    const keyword = params.get('keyword');

    if (title.match(/^(?!ホロライブ)(.+?)\s*【歌唱楽曲一覧】/)) {
        const name = RegExp.$1;
        applyFilter(2, name); //簡易
        applyFilter(3, name); //外部
        applyFilter(4, name); //歌ってみた
        applyFilter(99, name); //存在しない
    }
    if (title.includes("【動画一覧】") && keyword) {
        applyFilter(0, keyword);
    }
    if (title.includes("編集用_動画情報一覧") && keyword) {
        applyFilter(0, keyword);
    }

    //すべてのページ
    if (keyword) {
        const order = params.get('order') || 0;
        applyFilter(order, keyword);
    }

}, false);

window.addEventListener("hashchange", function() {

    const params = getParams(true);
    const keyword = params.get('keyword');

    if (keyword) {
        const order = params.get('order') || 0;
        applyFilter(order, keyword);
    }

}, false);

function createFilterSearch() {
    let url = new URL(window.location.href.split('#')[0]);
    var params = url.searchParams;
    params.delete('keyword');
    params.delete('order');
    let j = 0;

    let elements = document.getElementsByName('order');
    let len = elements.length;
    let checkValue = '0';
    for (let i = 0; i < len; i++){
        if (elements.item(i).checked){
            j = elements.item(i).value;
        }
    }

    let qry = document.getElementById(`table-filter-${j}`);
    link = document.getElementById('freeAreaRegExp');
    if (!qry) return;
    link.setAttribute('href', url + "?keyword=" + encodeURIComponent(qry.value) + "&order=" + j);
}

//自動実行
const title = document.title;
//歌唱楽曲リスト
if(title.includes("編集用_入力補助ツール")) {
	window.setInterval(convertSongList, 1000);
}

//歌唱楽曲リスト変換
//textArea[0-7]を使用
//入力0-5→出力6,7
function convertSongList() {
	let textArea = document.getElementsByClassName("PLAIN-BOX");
	let name = textArea[0].value.replace(/\n/g, "");
	let roman = textArea[1].value.replace(/\n/g, "");
	let date = textArea[2].value.replace(/\n/g, "");
	let castTitle = textArea[3].value.replace(/\n/g, "");
	let URL = textArea[4].value.replace(/\n/g, "");
	let songs = textArea[5].value.split("\n");


	let castList = "|" + name + "|[[" + date + ">#data_" + roman + date.replace(/\//g, "") + "]]&aname(" + roman + date.replace(/\//g, "") + ")|" 
					+ "[[" + castTitle + ">>" + URL + "]]|";


//カウントする処理
	let songList = "|" + name + "|[[" + date.replace(/\//g, ".") + "生" + ">#" + roman + date.replace(/\//g, "") + "]]" + "-001"
					+ "&aname(data_" + roman + date.replace(/\//g, "") + ")|"
					+ songs[0] + "||";

	let num = 1;
	for (let i = 1; i < songs.length; i++) {
		if (songs[i].length > 0) {
		songList = songList + "\n" + "|" + name + "|[[" + date.replace(/\//g, ".") + "生"
					+ ">#" + roman + date.replace(/\//g, "") + "]]" + "-" + String(i+1).padStart(3,"0") + "|"
					+ songs[i] + "||";
		num = num + 1;
		}
	}

	castList = castList + num + "||";

	textArea[6].value = castList;
	textArea[7].value = songList;

	textArea[6].readOnly = true;
	textArea[7].readOnly = true;
}

//手動実行
window.addEventListener('DOMContentLoaded', function() {
    let links = document.querySelectorAll('a');
    links.forEach(function(link) {
        if (link.getAttribute("href") == "#regreplace") {
            link.addEventListener('click', regReplace,false);
        }
    });
},false);


//正規表現変換
//textArea[8-11]を使用
//入力8-10→出力11
function regReplace() {
    let textArea = document.getElementsByClassName("PLAIN-BOX");
    let pattern = textArea[9].value;
    let convert = textArea[10].value;
    let after = textArea[8].value.replace(new RegExp(pattern,'g'),convert);
    textArea[11].value = after;
}
////
// ストライプ表示機能 stripe"
////

$(document).ready(function() {

  // ストライプ表示を更新するやつ
  $("table.stripe").on("update-stripe", function(){
    $(this).find("> tbody > tr").filter(":visible")
      .filter(':even').removeClass("even").addClass("odd").end()
      .filter(':odd').removeClass("odd").addClass("even");
  });

  // ストライプ適用
  $("table.stripe").trigger("update-stripe");

  // フィルター適用時に自動更新
  $("table.stripe.filter").on("change", function(){
    $(this).trigger("update-stripe");
  });
});

////
// フィルター機能の改善 class="filter regex"
////

$(document).ready(function() {

  // テーブルにイイカンジのフィルター機能を搭載
  $("table.filter").each(function(i){
    const input = $("#table-filter-"+i);
    const table = $(this);

    // フィルター入力欄とテーブルを紐づけ
    input.data("target", table);

    // オリジナルの入力監視機能を無効化
    input.unbind("focus").blur().unbind("blur");

    // 自前の入力監視・フィルター適用機能で上書き
    input.textChange({
        change: function(self) {
            $(self).trigger("apply");
        },
    });
    input.change(function(){
        $(this).trigger("apply");
    });

  });

  // 正規表現・大小区別に応じたマッチング関数を生成するやつ
  const gen_tester = (pattern, ignore, regex)=>{
    if (regex) {
      try {
        const re = new RegExp(pattern, (ignore ? "i" : ""));
        return (t)=>re.test(t);
      } catch (e) {
        return null;
      }
    } else {
      if (ignore) {
        const sub = pattern.toLowerCase();
        return (t)=>t.toLowerCase().includes(sub);
      } else {
        return (t)=>t.includes(pattern);
      }
    }
  };

  // 正規表現対応のフィルター適用処理
  $("input[id^='table-filter-']").on("apply", (()=>{
    let prev = null;
    return function(){
      const pattern = $(this).val();
      if (prev == pattern) return;
      prev = pattern;

      const table = $(this).data("target");

      // 設定に応じたマッチング関数を用意
      const is_regex = table.hasClass("regex");
      const ignore_case = true; // 一律で大小区別なし
      const test = gen_tester(pattern, ignore_case, is_regex);
      if (test == null) return;

      // フィルター適用
      const rows = table.find("> tbody > tr");
      rows.each((i,row)=>{
        $(row).toggle(test($(row).text()));
      });

      // ストライプ更新など
      table.trigger("change");
    };
  })());

});