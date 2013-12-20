function LockInfo(objectId){
  return {
    objectId:objectId,
    waitings:[],
    locked:null,
    onChange:function(){
      if(this.locked){
        this.locked.onLockInfoChanged(this);
      }
      for(var i=0;i<this.waitings.length;i++){
        this.waitings[i].onLockInfoChanged(this);
      }
    },
    addWaitings:function(thr){
      this.waitings.push(thr);
      this.onChange();
    },
    setLocked:function(thr){
      this.locked = thr;
      this.onChange();
    }
  };
}
function LinesInfo(start,end){
  var l = $('<span class="linesInfo">')
    .text('line:')
    .append($('<span class="lineNum">').text(start));
  if( end!==undefined ){
    l.append("-").append($('<span class="lineNum">').text(end));
  }
  return l;
}
function Thread(threads, threadId, threadName, condition, preThread, titleLine, startLineNumber){
  var div = $('<div class="thread tid-'+threadId+'"><span class="state"/>')
    .append($("<span>").text('"'+threadName+'" '+condition))
    .append("<span class=topStack>")
    .hide()
    .prepend($('<div style="float:right"><span class="expand-btn glyphicon glyphicon-chevron-left">'));
  var lines = [titleLine];
  var hasTopStack = false;
  var self = {
    div:div,
    threadDump:threads,
    threadId:threadId,
    preThread:preThread,
    linesData:lines,
    startLineNumber:startLineNumber,
    preThreads:function(){
      var thread = this;
      var ret = [];
      while(thread){
        ret.push(thread);
        thread=thread.preThread;
      }
      return ret;
    },
    addState:function(state,line){
      this.state = state;
      lines.push(line);
      div.addClass("state-"+state);
    },
    addWaiting:function(objectId,line){
      lines.push(line);
      if(!hasTopStack){
        div.find(".topStack").text(line);
        hasTopStack=true;
      }
      div.addClass("waiting-"+objectId);
      threads.addWaiting(objectId,this);
    },
    addStackTrace:function(line){
      if(!hasTopStack && this.state === "RUNNABLE"){
        div.find(".topStack").text(line);
        hasTopStack=true;
      }
      lines.push(line);
    },
    addLocked:function(objectId,line){
      lines.push(line);
      div.append($('<div class="locked-'+objectId+'" style="display:none"><span class="count"></span>').append($('<span>').text(line)));
      threads.addLocked(objectId,this);
    },
    lines:function(){
      var txt = div.find('.lines');
      if(txt.length === 0){
        txt = $('<div class="lines">').hide();
        var before=null;
        $.each(this.preThreads(),function(){
          var t = this;
          var view = $("<pre class='detail'>").text(t.threadDump.time).append(LinesInfo(t.startLineNumber,t.endLineNumber));
          $.each(t.linesData,function(i){
            $("<div class='line' data-ln="+i+">").text(this).appendTo(view);
          });
          if(before){
            var i = 1;
            var pr;
            var cur;
            var removed = 0;
            while((pr=before.linesData[before.linesData.length - i])!==undefined &&
              (cur=t.linesData[t.linesData.length - i])!==undefined){
              if(pr===cur){
                view.find("div[data-ln="+(t.linesData.length - i)+"]").remove();
                removed ++;
              }else{
                break;
              }
              i++;
            }
            if(removed){
              view.append($("<div class='longprocess'>").text("\t\t and same thread dump "+removed+" lines"));
            }
          }
          view.appendTo(txt);
          before = t;
        });
        txt.appendTo(div);
      }
      return txt;
    },
    onLockInfoChanged:function(lockInfo){
      if(lockInfo.locked==this){
        if(lockInfo.waitings.length){
          if(lockInfo.waitings.length==1 && lockInfo.waitings[0]==this){
            return;
          }
          div.find(".locked-"+lockInfo.objectId).show().find(".count").text(lockInfo.waitings.length+" waiting)");
          threads.div.find('.waiting-'+lockInfo.objectId).addClass('blocked');
          div.addClass('blocking');
        }
      }
    },
    finish:function(endLineNumber){
      this.endLineNumber = endLineNumber;
      var s = div.find(".state");
      var tip=[];
      $.each(this.preThreads(),function(){
        tip.push(this.state);
        var preState = $('<span class="prestate prethread-'+this.state+'">').text((this.state||"").charAt(0)).appendTo(s);
        if(this.preThread && this.linesData.length > 1){
          var join = $("<span>");
          if(this.preThread.linesData.length == this.linesData.length && this.linesData.join("\n")===this.preThread.linesData.join("\n")){
            join.text("=").appendTo(preState);
            preState.addClass("longprocess");
          }else{
            join.text("<").appendTo(s);
          }
        }
      });
      s.prop("title",tip.join(" <= "));
    }
  };
  div.data('thread',self);
  return self;
}
function ThreadDump(preThreadDump, time, head, startLineNumber){
  var div = $("<div class='threads'>");
  var lockes = {};
  var threadList={};
  var threadSize=0;
  var timeText = time;
  if(preThreadDump && preThreadDump.time){
    console.log("sec",new Date(time).getTime(),new Date(preThreadDump.time).getTime());
    timeText += " after "+ ((new Date(time).getTime()-(new Date(preThreadDump.time).getTime()))/1000)+"sec";
  }
  var timeView = $('<div class="time">').text(timeText+" "+head).append(LinesInfo(startLineNumber));
  var header = $("<div class='header'>").append(timeView).appendTo(div);
  var threadBox = $('<div>').appendTo(div);
  function lockOf(objectId){
    lockes[objectId] = lockes[objectId] || LockInfo(objectId);
    return lockes[objectId];
  }
  function preThread(threadId){
    if(preThreadDump && preThreadDump.threadList[threadId]){
      return preThreadDump.threadList[threadId];
    }else{
      return null;
    }
  }
  return {
    div:div,
    header:header,
    time:time,
    threadSize:threadSize,
    threadList:threadList,
    startLineNumber:startLineNumber,
    timeText:timeText,
    threadBox:threadBox,
    newThread:function(threadId,threadName,contidion,titleLine,startLineNumber){
      var thread = Thread(this, threadId, threadName, contidion, preThread(threadId), titleLine, startLineNumber);
      thread.div.appendTo(threadBox);
      threadList[threadId]=thread;
      threadSize+=1;
      return thread;
    },
    addWaiting:function(objectId,thread){
      lockOf(objectId).addWaitings(thread);
    },
    addLocked:function(objectId,thread){
      lockOf(objectId).setLocked(thread);
    },
    finish:function(endLineNumber){
      this.endLineNumber = endLineNumber;
      div.find('.header .linesInfo').html(LinesInfo(startLineNumber,endLineNumber));
      var toolbar = $('<div class="bar">').text('Thread count='+threadSize).appendTo(header);
      var t = $('<div class="btn-group" data-toggle="buttons">').appendTo(toolbar);
      $.each("WAITING TIMED_WAITING RUNNABLE BLOCKED".split(" "),function(){
        var state = this;
        var checkbox = $('<input type=checkbox>').change(function(){
          div.find('.state-'+state).toggle(this.checked);
        });
        var badge = $('<span class="badge">').text(div.find(".state-"+state).length);
        $('<label class="lb-'+state+' btn btn-default">').text(state).append(badge).prepend(checkbox).appendTo(t);
      });
      div.delegate('.thread','dblclick',function(){
        var t = $(this);
        var eb = t.find('.expand-btn');
        var isFolding = eb.hasClass('glyphicon-chevron-left');
        if(isFolding){
          t.data('thread').lines().show();
          eb.removeClass('glyphicon-chevron-left').addClass('glyphicon-chevron-down');
        }else{
          t.data('thread').lines().hide();
          eb.addClass('glyphicon-chevron-left').removeClass('glyphicon-chevron-down');
        }
        return false;
      }).delegate('.expand-btn','click',function(){
        $(this).parents('.thread').trigger('dblclick');
        return false;
      });
    }
  };
}
function Checker(pattern, func){
  this.pattern = pattern;
  this.func = func;
}
Checker.prototype.test = function(line){
  var mm = this.pattern.exec(line);
  if(mm){
    this.func(mm,line);
    return true;
  }
};
function Parser(lines,div){
  var thread = null;
  var threadDumps = [];
  var lineNumber=-1;
  function threadFinish(){
    if(thread){
      thread.finish(lineNumber);
    }
    thread = null;
  }
  var oneThreadDump = null;
  var preThreadDump = null;
  var line;
  var checkers = [
    new Checker(/^\s+at [a-zA-Z].*$/,function(m,line){
      thread.addStackTrace(line);
    }),
    new Checker(/^\s+- (waiting to lock|parking to wait for|waiting on|locked)\s+<(0x[a-f0-9]+)>/,function(m,line){
      if(m[1] === "locked"){
        thread.addLocked(m[2],line);
      }else{
        thread.addWaiting(m[2],line);
      }
    }),
    new Checker(/^"([^"]+?)" (?:daemon )?prio=\d+.* tid=(0x[a-f0-9]+)(?:\s+[a-zA-Z0-9_]+=0x[a-f0-9]+)*\s+([^\[]+)(?:\[|$)/, function(m,line){
      threadFinish();
      thread = oneThreadDump.newThread(m[2], m[1], m[3], line, lineNumber);
    }),
    new Checker(/^$/,function(m,line){
      threadFinish();
    }),
    new Checker(/^\s+java.lang.Thread.State: ([A-Z_]+)/,function(m,line){
      thread.addState(m[1],line);
    }),
    new Checker(/^JNI global references/,function(m,line){
      finishThreadDump();
    })
  ];
  function finishThreadDump(){
    threadFinish();
    next = findThreadDump;
    if(oneThreadDump){
      oneThreadDump.finish(lineNumber);
      preThreadDump = oneThreadDump;
      oneThreadDump = null;
    }
  }
  function parseThreadDump(){
    var find = false;
    for(var j=0;j<checkers.length; j++){
      if(checkers[j].test(line)){
        find=true;
        break;
      }
    }
    if(find===false){
      console.log("unexpected line "+lineNumber+":"+line);
    }
  }
  function findThreadDump(){
    if(lineNumber>0 && /^Full thread dump/.test(line) && /^\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d$/.test(lines[lineNumber-1])){
      oneThreadDump = ThreadDump(preThreadDump, lines[lineNumber-1], line, lineNumber);
      threadDumps.push(oneThreadDump);
      if(preThreadDump){
        oneThreadDump.div.insertBefore(preThreadDump.div);
      }else{
        oneThreadDump.div.appendTo(div);
      }
      next = parseThreadDump;
      return;
    }
  }
  var next = findThreadDump;
  return {
    threadDumps:threadDumps,
    lines:lines,
    lineNumber:function(){
      return lineNumber;
    },
    hasNext:function(){
      return lineNumber<lines.length;
    },
    next:function(){
      lineNumber++;
      line = lines[lineNumber];
      try{
        next();
      }catch(e){
        console.log("lineNumber=",lineNumber);
        console.log("line=",lines[lineNumber-2]);
        console.log("line=",lines[lineNumber-1]);
        console.log("line=",lines[lineNumber]);
        console.log("line=",lines[lineNumber+1]);
        console.log("line=",lines[lineNumber+2]);
        console.log("thread=",thread);
        throw e;
      }
    },
    finish:function(){
      finishThreadDump();
    }
  };
}
function parse(lines,div,callback){
  var p = Parser(lines,div);
  function doParse(){
    for(var i=0;i<1000 && p.hasNext(); i++){
      p.next();
    }
    p.finish();
    callback(p.lineNumber(),p.lines.length, p.threadDumps);
    if(p.hasNext()){
      setTimeout(doParse);
    }
  }
  doParse();
}
