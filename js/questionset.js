var H5P = H5P || {};

/**
 * Will render a Question with multiple choices for answers.
 *
 * Events provided:
 * - h5pQuestionSetFinished: Triggered when a question is finished. (User presses Finish-button)
 *
 * @param {Array} options
 * @param {int} contentId
 * @returns {H5P.QuestionSet} Instance
 */
H5P.QuestionSet = function (options, contentId) {
  if (!(this instanceof H5P.QuestionSet)) {
    return new H5P.QuestionSet(options, contentId);
  }
  H5P.EventDispatcher.call(this);
  var $ = H5P.jQuery;
  var self = this;
  this.contentId = contentId;

  var texttemplate =
          '<% if (introPage.showIntroPage) { %>' +
          '<div class="intro-page">' +
          '  <% if (introPage.title) { %>' +
          '    <div class="title"><span><%= introPage.title %></span></div>' +
          '  <% } %>' +
          '  <% if (introPage.introduction) { %>' +
          '    <div class="introduction"><%= introPage.introduction %></div>' +
          '  <% } %>' +
          '  <div class="buttons"><a class="qs-startbutton h5p-joubelui-button h5p-button"><%= introPage.startButtonText %></a></div>' +
          '</div>' +
          '<% } %>' +
          '<div class="questionset<% if (introPage.showIntroPage) { %> hidden<% } %>">' +
          '  <% for (var i=0; i<questions.length; i++) { %>' +
          '    <div class="question-container"></div>' +
          '  <% } %>' +
          '  <div class="qs-footer">' +
          '    <div class="qs-progress">' +
          '      <% if (progressType == "dots") { %>' +
          '        <div class="dots-container">' +
          '          <% for (var i=0; i<questions.length; i++) { %>' +
          '            <a href="#" class="progress-dot unanswered" aria-label="<%= questions[i].jumpAriaLabel %>"></a>' +
          '          <%} %>' +
          '        </div>' +
          '      <% } else if (progressType == "textual") { %>' +
          '        <span class="progress-text"></span>' +
          '      <% } %>' +
          '    </div>' +
          '  </div>' +
          '</div>';

  var resulttemplate =
          '<div class="questionset-results">' +
          '  <div class="greeting"><%= message %></div>' +
          '  <div class="feedback-section">' +
          '    <div class="feedback-scorebar"></div>' +
          '    <div class="feedback-text"></div>' +
          '  </div>' +
          '  <% if (comment) { %>' +
          '  <div class="result-header"><%= comment %></div>' +
          '  <% } %>' +
          '  <div class="result-text"><%= resulttext %></div>' +
          '  <div class="buttons">' +
          '    <button type="button" class="h5p-joubelui-button h5p-button qs-finishbutton"><%= finishButtonText %></button>' +
          '    <button type="button" class="h5p-joubelui-button h5p-button qs-solutionbutton"><%= solutionButtonText %></button>' +
          '    <button type="button" class="h5p-joubelui-button h5p-button qs-retrybutton"><%= retryButtonText %></button>' +
          '  </div>' +
          '</div>';

  var defaults = {
    randomOrder: false,
    initialQuestion: 0,
    progressType: 'dots',
    passPercentage: 50,
    questions: [],
    introPage: {
      showIntroPage: false,
      title: '',
      introduction: '',
      startButtonText: 'Start'
    },
    texts: {
      prevButton: 'Previous question',
      nextButton: 'Next question',
      finishButton: 'Finish',
      textualProgress: 'Question: @current of @total questions',
      jumpToQuestion: 'Jump to question %d',
      questionLabel: 'Question'
    },
    endGame: {
      showResultPage: true,
      message: 'Your result:',
      successGreeting: 'Congratulations!',
      successComment: 'You have enough correct answers to pass the test.',
      failGreeting: 'Sorry!',
      failComment: "You don't have enough correct answers to pass this test.",
      scoreString: '@score of @total points',
      finishButtonText: 'Finish',
      solutionButtonText: 'Solution',
      retryButtonText: 'Retry',
      showAnimations: false,
      skipButtonText: 'Skip video'
    }
  };

  var template = new EJS({text: texttemplate});
  var endTemplate = new EJS({text: resulttemplate});
  var params = $.extend(true, {}, defaults, options);

  var currentQuestion = 0;
  var questionInstances = [];
  var $myDom;
  var scoreBar;
  var up;
  renderSolutions = false;

  // Set overrides for questions
  var override;
  if (params.override.showSolutionButton || params.override.retryButton) {
    override = {};
    if (params.override.showSolutionButton) {
      // Force "Show solution" button to be on or off for all interactions
      override.enableSolutionsButton =
          (params.override.showSolutionButton === 'on' ? true : false);
    }

    if (params.override.retryButton) {
      // Force "Retry" button to be on or off for all interactions
      override.enableRetry =
          (params.override.retryButton === 'on' ? true : false);
    }
  }

  // Instantiate question instances
  for (var i = 0; i < params.questions.length; i++) {
    var question = params.questions[i];

    question.jumpAriaLabel = params.texts.jumpToQuestion.replace('%d', i + 1);
    if (override) {
      // Extend subcontent with the overrided settings.
      $.extend(question.params.behaviour, override);
    }
    var questionInstance = H5P.newRunnable(question, contentId, undefined, undefined, {parent: self});
    questionInstance.on('resize', function () {
      up = true;
      self.trigger('resize');
    });
    questionInstances.push(questionInstance);
  }

  // Resize all interactions on resize
  self.on('resize', function () {
    if (up) {
      // Prevent resizing the question again.
      up = false;
      return;
    }

    for (var i = 0; i < questionInstances.length; i++) {
      questionInstances[i].trigger('resize');
    }
  });

  // Update button state.
  var _updateButtons = function () {
    var answered = true;
    for (var i = questionInstances.length - 1; i >= 0; i--) {
      answered = answered && (questionInstances[i]).getAnswerGiven();
    }

    if (currentQuestion === (params.questions.length - 1) && answered &&
        questionInstances[currentQuestion]) {
      questionInstances[currentQuestion].showButton('finish');
    }
 };

  var _stopQuestion = function (questionNumber) {
    if (questionInstances[questionNumber]) {
      pauseMedia(questionInstances[questionNumber]);
    }
  };

  var _showQuestion = function (questionNumber) {
    // Sanitize input.
    if (questionNumber < 0) {
      questionNumber = 0;
    }
    if (questionNumber >= params.questions.length) {
      questionNumber = params.questions.length - 1;
    }

    currentQuestion = questionNumber;

    // Hide all questions
    $('.question-container', $myDom).hide().eq(questionNumber).show();

    if (questionInstances[questionNumber]) {
      // Trigger resize on question in case the size of the QS has changed.
      var instance = questionInstances[questionNumber];
      instance.setActivityStarted();
      if (instance.$ !== undefined) {
        instance.trigger('resize');
      }
    }

    // Update progress indicator
    // Test if current has been answered.
    if (params.progressType === 'textual') {
      $('.progress-text', $myDom).text(params.texts.textualProgress.replace("@current", questionNumber+1).replace("@total", params.questions.length));
    }
    else {
      // Set currentNess
      $('.progress-dot.current', $myDom).removeClass('current');
      $('.progress-dot:eq(' + questionNumber +')', $myDom).addClass('current');
    }

    // Remember where we are
    _updateButtons();
    self.trigger('resize');
    return currentQuestion;
  };

  /**
   * Show solutions for subcontent, and hide subcontent buttons.
   * Used for contracts with integrated content.
   * @public
   */
  var showSolutions = function () {
    for (var i = 0; i < questionInstances.length; i++) {
      try {
        questionInstances[i].showSolutions();
      }
      catch(error) {
        H5P.error("subcontent does not contain a valid showSolutions function");
        H5P.error(error);
      }
    }
  };

  /**
   * Resets the task and every subcontent task.
   * Used for contracts with integrated content.
   * @public
   */
  var resetTask = function () {
    for (var i = 0; i < questionInstances.length; i++) {
      try {
        questionInstances[i].resetTask();
      }
      catch(error) {
        H5P.error("subcontent does not contain a valid resetTask function");
        H5P.error(error);
      }
    }

    // Hide finish button
    questionInstances[questionInstances.length - 1].hideButton('finish');

    //Force the last page to be reRendered
    rendered = false;
  };

  var rendered = false;

  this.reRender = function () {
    rendered = false;
  };

  var moveQuestion = function (direction) {
    _stopQuestion(currentQuestion);
    if (currentQuestion + direction >= questionInstances.length) {
      _displayEndGame();

    }
    else {
      _showQuestion(currentQuestion + direction);
    }
  };

  var _displayEndGame = function () {
    if (rendered) {
      $myDom.children().hide().filter('.questionset-results').show();
      self.trigger('resize');
      return;
    }
    //Remove old score screen.
    $myDom.children().hide().filter('.questionset-results').remove();
    rendered = true;

    // Get total score.
    var finals = self.getScore();
    var totals = self.totalScore();
    var scoreString = params.endGame.scoreString.replace("@score", finals).replace("@total", totals);
    var success = ((100 * finals / totals) >= params.passPercentage);
    var eventData = {
      score: scoreString,
      passed: success
    };

    /**
     * Makes our buttons behave like other buttons.
     *
     * @private
     * @param {string} classSelector
     * @param {function} handler
     */
    var hookUpButton = function (classSelector, handler) {
      $(classSelector, $myDom).click(handler).keypress(function (e) {
        if (e.which === 32) {
          handler();
          e.preventDefault();
        }
      });
    };

    var displayResults = function () {
      self.triggerXAPICompleted(self.getScore(), self.totalScore(), success);

      if (!params.endGame.showResultPage) {
        self.trigger('h5pQuestionSetFinished', eventData);
        return;
      }

      var eparams = {
        message: params.endGame.message,
        comment: (success ? params.endGame.successGreeting : params.endGame.failGreeting),
        resulttext: (success ? params.endGame.successComment : params.endGame.failComment),
        finishButtonText: params.endGame.finishButtonText,
        solutionButtonText: params.endGame.solutionButtonText,
        retryButtonText: params.endGame.retryButtonText
      };

      // Show result page.
      $myDom.children().hide();
      $myDom.append(endTemplate.render(eparams));

      // Add event handlers to summary buttons
      hookUpButton('.qs-finishbutton', function () {
        self.trigger('h5pQuestionSetFinished', eventData);
      });
      hookUpButton('.qs-solutionbutton', function () {
        showSolutions();
        $myDom.children().hide().filter('.questionset').show();
        _showQuestion(params.initialQuestion);
      });
      hookUpButton('.qs-retrybutton', function () {
        resetTask();
        $myDom.children().hide();

        var $intro = $('.intro-page', $myDom);
        if ($intro.length) {
          // Show intro
          $('.intro-page', $myDom).show();
        }
        else {
          // Show first question
          $('.questionset', $myDom).show();
          _showQuestion(params.initialQuestion);
        }
      });

      if (scoreBar === undefined) {
        scoreBar = H5P.JoubelUI.createScoreBar(totals);
      }
      scoreBar.appendTo($('.feedback-scorebar', $myDom));
      scoreBar.setScore(finals);
      $('.feedback-text', $myDom).html(scoreString);
    };

    if (params.endGame.showAnimations) {
      var videoData = success ? params.endGame.successVideo : params.endGame.failVideo;
      if (videoData) {
        $myDom.children().hide();
        var $videoContainer = $('<div class="video-container"></div>').appendTo($myDom);

        var video = new H5P.Video({
          sources: videoData,
          fitToWrapper: true,
          controls: false,
          autoplay: false
        }, contentId);
        video.on('stateChange', function (event) {
          if (event.data === H5P.Video.ENDED) {
            displayResults();
            $videoContainer.hide();
          }
        });
        video.attach($videoContainer);
        // Resize on video loaded
        video.on('loaded', function () {
          self.trigger('resize');
        });
        video.play();

        if (params.endGame.skipButtonText) {
          $('<a class="h5p-joubelui-button h5p-button skip">' + params.endGame.skipButtonText + '</a>').click(function () {
            video.pause();
            $videoContainer.hide();
            displayResults();
          }).appendTo($videoContainer);
        }

        return;
      }
    }
    // Trigger finished event.
    displayResults();
    self.trigger('resize');
  };

  // Function for attaching the multichoice to a DOM element.
  this.attach = function (target) {
    if (this.isRoot()) {
      this.setActivityStarted();
    }
    if (typeof(target) === "string") {
      $myDom = $('#' + target);
    }
    else {
      $myDom = $(target);
    }

    // Render own DOM into target.
    $myDom.html(template.render(params));
    if (params.backgroundImage !== undefined) {
      $myDom.css({
        overflow: 'hidden',
        background: '#fff url("' + H5P.getPath(params.backgroundImage.path, contentId) + '") no-repeat 50% 50%',
        backgroundSize: '100% auto'
      });
    }

    if (params.introPage.backgroundImage !== undefined) {
      var $intro = $myDom.find('.intro-page');
      if ($intro.length) {
        var bgImg = params.introPage.backgroundImage;
        var bgImgRatio = (bgImg.height / bgImg.width);
        $intro.css({
          background: '#fff url("' + H5P.getPath(bgImg.path, contentId) + '") no-repeat 50% 50%',
          backgroundSize: 'auto 100%',
          minHeight: bgImgRatio * +window.getComputedStyle($intro[0]).width.replace('px','')
        });
      }
    }
    var registerImageLoadedListener = function (question) {
      H5P.on(question, 'imageLoaded', function () {
        self.trigger('resize');
      });
    };

    // Attach questions
    for (var i = 0; i < questionInstances.length; i++) {
      var question = questionInstances[i];

      question.attach($('.question-container:eq(' + i + ')', $myDom));

      // Listen for image resize
      registerImageLoadedListener(question);

      // Add next/finish button
      if (questionInstances[questionInstances.length -1] === question) {

        // Add finish question set button
        question.addButton('finish', params.texts.finishButton,
          moveQuestion.bind(this, 1), false);

      } else {

        // Add next question button
        question.addButton('next', '', moveQuestion.bind(this, 1), true, {
          href: '#', // Use href since this is a navigation button
          'aria-label': params.texts.nextButton
        });
      }

      // Add previous question button
      if (questionInstances[0] !== question) {
        question.addButton('prev', '', moveQuestion.bind(this, -1), true, {
          href: '#', // Use href since this is a navigation button
          'aria-label': params.texts.prevButton
        });
      }

      question.on('xAPI', function (event) {
        var shortVerb = event.getVerb();
        if (shortVerb === 'interacted' ||
            shortVerb === 'answered' ||
            shortVerb === 'attempted') {
          $('.progress-dot:eq(' + currentQuestion +')', $myDom).removeClass('unanswered').addClass('answered');
          _updateButtons();
        }
        if (shortVerb === 'completed') {
          // An activity within this activity is not allowed to send completed events
          event.setVerb('answered');
        }
        if (event.data.statement.context.extensions === undefined) {
          event.data.statement.context.extensions = [];
        }
        event.data.statement.context.extensions['http://id.tincanapi.com/extension/ending-point'] = currentQuestion + 1;
      });
      if (question.getAnswerGiven()) {
        $('.progress-dot:eq(' + i +')', $myDom).removeClass('unanswered').addClass('answered');
      }
    }

    // Allow other libraries to add transitions after the questions have been inited
    $('.questionset', $myDom).addClass('started');

    $('.qs-startbutton', $myDom).click(function () {
      $(this).parents('.intro-page').hide();
      $('.questionset', $myDom).show();
      _showQuestion(params.initialQuestion);
    });

    // Set event listeners.
    $('.progress-dot', $myDom).click(function () {
      _stopQuestion(currentQuestion);
      _showQuestion($(this).index());
      return false;
    });

    // Hide all but initial Question.
    _showQuestion(params.initialQuestion);
    _updateButtons();

    if (renderSolutions) {
      showSolutions();
    }

    this.trigger('resize');

    return this;
  };

  // Get current score for questionset.
  this.getScore = function () {
    var score = 0;
    for (var i = questionInstances.length - 1; i >= 0; i--) {
      score += questionInstances[i].getScore();
    }
    return score;
  };

  // Get total score possible for questionset.
  this.totalScore = function () {
    var score = 0;
    for (var i = questionInstances.length - 1; i >= 0; i--) {
      score += questionInstances[i].getMaxScore();
    }
    return score;
  };

  /**
   * Gather copyright information for the current content.
   *
   * @returns {H5P.ContentCopyrights}
   */
  this.getCopyrights = function () {
    var info = new H5P.ContentCopyrights();

    // Background
    if (params.backgroundImage !== undefined && params.backgroundImage.copyright !== undefined) {
      var background = new H5P.MediaCopyright(params.backgroundImage.copyright);
      background.setThumbnail(new H5P.Thumbnail(H5P.getPath(params.backgroundImage.path, contentId), params.backgroundImage.width, params.backgroundImage.height));
      info.addMedia(background);
    }

    // Questions
    var questionCopyrights;
    for (var i = 0; i < questionInstances.length; i++) {
      var instance = questionInstances[i];
      var qParams = params.questions[i].params;
      questionCopyrights = undefined;

      if (instance.getCopyrights !== undefined) {
        // Use the instance's own copyright generator
        questionCopyrights = instance.getCopyrights();
      }
      if (questionCopyrights === undefined) {
        // Create a generic flat copyright list
        questionCopyrights = new H5P.ContentCopyrights();
        H5P.findCopyrights(questionCopyrights, qParams, contentId);
      }

      // Determine label
      var label = (params.texts.questionLabel + ' ' + (i + 1));
      if (qParams.contentName !== undefined) {
        label += ': ' + qParams.contentName;
      }
      else if (instance.getTitle !== undefined) {
        label += ': ' + instance.getTitle();
      }
      questionCopyrights.setLabel(label);

      // Add info
      info.addContent(questionCopyrights);
    }

    // Success video
    var video;
    if (params.endGame.successVideo !== undefined && params.endGame.successVideo.length > 0) {
      video = params.endGame.successVideo[0];
      if (video.copyright !== undefined) {
        info.addMedia(new H5P.MediaCopyright(video.copyright));
      }
    }

    // Fail video
    if (params.endGame.failVideo !== undefined && params.endGame.failVideo.length > 0) {
      video = params.endGame.failVideo[0];
      if (video.copyright !== undefined) {
        info.addMedia(new H5P.MediaCopyright(video.copyright));
      }
    }

    return info;
  };
  this.getQuestions = function() {
    return questionInstances;
  };
  this.showSolutions = function() {
    renderSolutions = true;
  };

  /**
   * Stop the given element's playback if any.
   *
   * @param {object} instance
   */
  var pauseMedia = function (instance) {
    try {
      if (instance.pause !== undefined &&
        (instance.pause instanceof Function ||
        typeof instance.pause === 'function')) {
        instance.pause();
      }
    }
    catch (err) {
      // Prevent crashing, log error.
      H5P.error(err);
    }
  };
};

H5P.QuestionSet.prototype = Object.create(H5P.EventDispatcher.prototype);
H5P.QuestionSet.prototype.constructor = H5P.QuestionSet;
