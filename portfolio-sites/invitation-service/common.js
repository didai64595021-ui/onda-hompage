/* ========================================
   INVITATION SERVICE - Common JS
   ======================================== */

$(function(){
  // ========== GNB Scroll ==========
  $(window).on('scroll', function(){
    $('.gnb').toggleClass('scrolled', $(this).scrollTop() > 10);
  });

  // ========== Mobile Menu ==========
  $('.hamburger').on('click', function(){
    $(this).toggleClass('active');
    $('.mobile-menu').toggleClass('open');
    $('.mobile-overlay').toggleClass('show');
    $('body').toggleClass('no-scroll');
  });
  $('.mobile-overlay, .mobile-menu .close-btn').on('click', function(){
    $('.hamburger').removeClass('active');
    $('.mobile-menu').removeClass('open');
    $('.mobile-overlay').removeClass('show');
    $('body').removeClass('no-scroll');
  });
  $('.mobile-menu a').on('click', function(){
    $('.hamburger').removeClass('active');
    $('.mobile-menu').removeClass('open');
    $('.mobile-overlay').removeClass('show');
    $('body').removeClass('no-scroll');
  });

  // ========== Scroll Animations ==========
  if('IntersectionObserver' in window){
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          $(e.target).addClass('visible');
          observer.unobserve(e.target);
        }
      });
    }, {threshold:0.15, rootMargin:'0px 0px -40px 0px'});
    document.querySelectorAll('.fade-up,.fade-in,.scale-in').forEach(function(el){ observer.observe(el); });
  } else {
    $('.fade-up,.fade-in,.scale-in').addClass('visible');
  }

  // ========== Image Error Fallback ==========
  $('img').on('error', function(){
    var w = $(this).width() || 400, h = $(this).height() || 300;
    $(this).attr('src','https://placehold.co/'+w+'x'+h+'/FFFDF7/B76E79?text=Image');
  });

  // ========== Counter Animation ==========
  function animateCounter($el){
    var target = parseInt($el.data('count')) || 0;
    var duration = 2000, start = 0, step = target / (duration/16);
    var suffix = $el.data('suffix') || '';
    var prefix = $el.data('prefix') || '';
    var timer = setInterval(function(){
      start += step;
      if(start >= target){ start = target; clearInterval(timer); }
      $el.text(prefix + Math.floor(start).toLocaleString() + suffix);
    },16);
  }
  if('IntersectionObserver' in window){
    var counterObs = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          animateCounter($(e.target));
          counterObs.unobserve(e.target);
        }
      });
    },{threshold:0.5});
    document.querySelectorAll('[data-count]').forEach(function(el){ counterObs.observe(el); });
  }

  // ========== Active Nav ==========
  var currentPage = location.pathname.split('/').pop() || 'index.html';
  $('.gnb-menu a, .mobile-menu a').each(function(){
    var href = $(this).attr('href');
    if(href === currentPage) $(this).addClass('active');
  });
});

// ========== Toast ==========
function showToast(msg){
  var $c = $('.toast-container');
  if(!$c.length){ $c = $('<div class="toast-container"></div>').appendTo('body'); }
  var $t = $('<div class="toast">'+msg+'</div>').appendTo($c);
  setTimeout(function(){ $t.remove(); }, 3000);
}

// ========== Copy to Clipboard ==========
function copyToClipboard(text){
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(function(){ showToast('링크가 복사되었습니다 ✓'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('링크가 복사되었습니다 ✓');
  }
}

// ========== Modal ==========
function openModal(id){
  $('#'+id).addClass('active');
  $('body').addClass('no-scroll');
}
function closeModal(id){
  $('#'+id).removeClass('active');
  $('body').removeClass('no-scroll');
}
$(document).on('click','.modal-overlay',function(e){
  if($(e.target).hasClass('modal-overlay')){
    $(this).removeClass('active');
    $('body').removeClass('no-scroll');
  }
});

// no-scroll style
$('<style>.no-scroll{overflow:hidden}</style>').appendTo('head');
