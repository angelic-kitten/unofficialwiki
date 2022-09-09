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

    if (title.match(/^(?!�ǂ��ƃ��C�u)(.+?)\s*�y�̏��y�Ȉꗗ�z/)) {
        const name = RegExp.$1;
        applyFilter(2, name); //�Ȉ�
        applyFilter(3, name); //�O��
        applyFilter(4, name); //�̂��Ă݂�
        a(99, name); //���݂��Ȃ�
    }
    if (title.includes("�yYouTube����ꗗ�z") && keyword) {
        applyFilter(0, keyword);
    }
    if (title.includes("�ҏW�p_������ꗗ") && keyword) {
        applyFilter(0, keyword);
    }

    //���ׂẴy�[�W
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
-->
</script>
<script>
//�������s
const title = document.title;
//�̏��y�ȃ��X�g
if(title.includes("�ҏW�p_���͕⏕�c�[��")) {
	window.setInterval(convertSongList, 1000);
}

//�̏��y�ȃ��X�g�ϊ�
//textArea[0-7]���g�p
//����0-5���o��6,7
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


//�J�E���g���鏈��
	let songList = "|" + name + "|[[" + date.replace(/\//g, ".") + "��" + ">#" + roman + date.replace(/\//g, "") + "]]" + "-001"
					+ "&aname(data_" + roman + date.replace(/\//g, "") + ")|"
					+ songs[0] + "||";

	let num = 1;
	for (let i = 1; i < songs.length; i++) {
		if (songs[i].length > 0) {
		songList = songList + "\n" + "|" + name + "|[[" + date.replace(/\//g, ".") + "��"
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

//�蓮���s
window.addEventListener('DOMContentLoaded', function() {
    let links = document.querySelectorAll('a');
    links.forEach(function(link) {
        if (link.getAttribute("href") == "#regreplace") {
            link.addEventListener('click', regReplace,false);
        }
    });
},false);


//���K�\���ϊ�
//textArea[8-11]���g�p
//����8-10���o��11
function regReplace() {
    let textArea = document.getElementsByClassName("PLAIN-BOX");
    let pattern = textArea[9].value;
    let convert = textArea[10].value;
    let after = textArea[8].value.replace(new RegExp(pattern,'g'),convert);
    textArea[11].value = after;
}
</script>

<script>
////
// �X�g���C�v�\���@�\ stripe"
////

$(document).ready(function() {

  // �X�g���C�v�\�����X�V������
  $("table.stripe").on("update-stripe", function(){
    $(this).find("> tbody > tr").filter(":visible")
      .filter(':even').removeClass("even").addClass("odd").end()
      .filter(':odd').removeClass("odd").addClass("even");
  });

  // �X�g���C�v�K�p
  $("table.stripe").trigger("update-stripe");

  // �t�B���^�[�K�p���Ɏ����X�V
  $("table.stripe.filter").on("change", function(){
    $(this).trigger("update-stripe");
  });
});

////
// �t�B���^�[�@�\�̉��P class="filter regex"
////

$(document).ready(function() {

  // �e�[�u���ɃC�C�J���W�̃t�B���^�[�@�\�𓋍�
  $("table.filter").each(function(i){
    const input = $("#table-filter-"+i);
    const table = $(this);

    // �t�B���^�[���͗��ƃe�[�u����R�Â�
    input.data("target", table);

    // �I���W�i���̓��͊Ď��@�\�𖳌���
    input.unbind("focus").blur().unbind("blur");

    // ���O�̓��͊Ď��E�t�B���^�[�K�p�@�\�ŏ㏑��
    input.textChange({
        change: function(self) {
            $(self).trigger("apply");
        },
    });
    input.change(function(){
        $(this).trigger("apply");
    });

  });

  // ���K�\���E�召��ʂɉ������}�b�`���O�֐��𐶐�������
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

  // ���K�\���Ή��̃t�B���^�[�K�p����
  $("input[id^='table-filter-']").on("apply", (()=>{
    let prev = null;
    return function(){
      const pattern = $(this).val();
      if (prev == pattern) return;
      prev = pattern;

      const table = $(this).data("target");

      // �ݒ�ɉ������}�b�`���O�֐���p��
      const is_regex = table.hasClass("regex");
      const ignore_case = true; // �ꗥ�ő召��ʂȂ�
      const test = gen_tester(pattern, ignore_case, is_regex);
      if (test == null) return;

      // �t�B���^�[�K�p
      const rows = table.find("> tbody > tr");
      rows.each((i,row)=>{
        $(row).toggle(test($(row).text()));
      });

      // �X�g���C�v�X�V�Ȃ�
      table.trigger("change");
    };
  })());

});
