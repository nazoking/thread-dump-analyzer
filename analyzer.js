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
function Thread(threads, threadId, threadName, condition, preThread, titleLine){
  var div = $('<div class="thread tid-'+threadId+'"><span class="state"/>').append($("<span>").text('"'+threadName+'" '+condition)).append("<span class=topStack>");
  var lines = [titleLine];
  var hasTopStack = false;
  var self = {
    div:div,
    threadDump:threads,
    threadId:threadId,
    preThread:preThread,
    linesData:lines,
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
          var view = $("<pre>").text(t.threadDump.time);
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
      var s = div.find(".state");
      $.each(this.preThreads(),function(){
        var preState = $('<span class="prestate prethread-'+this.state+'">').text((this.state||"").charAt(0)).appendTo(s);
        if(this.preThread){
          var join = $("<span>");
          if(this.preThread.linesData.length == this.linesData.length && this.linesData.join("\n")===this.preThread.linesData.join("\n")){
            join.text("=").appendTo(preState);
            preState.addClass("longprocess");
          }else{
            join.text("<").appendTo(s);
          }
        }
      });
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
  var header = $("<div class='header'>").text(time+"====="+head).append($('<span class=linesInfo>').text('(line:'+startLineNumber+'-'));
  div.append(header);
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
    newThread:function(threadId,threadName,contidion,titleLine){
      var thread = Thread(this, threadId, threadName, contidion, preThread(threadId), titleLine);
      div.append(thread.div);
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
      div.find('.linesInfo').text(div.find('.linesInfo').text()+endLineNumber+')');
      var t = $('<div>').text('Thread count='+threadSize).appendTo(header);
      $.each("WAITING TIMED_WAITING RUNNABLE BLOCKED".split(" "),function(){
        var state = this;
        var checkbox = $('<input type=checkbox>').change(function(){
          div.find('.state-'+state).toggle(this.checked);
        });
        $('<label>').text(state+"("+div.find(".state-"+state).length+")").prepend(checkbox).appendTo(t);
        if("WAITING"==state || "TIMED_WAITING"==state){
          checkbox.trigger("change");
        }else{
          checkbox.prop("checked","checked");
        }
      });
      div.delegate('.thread','dblclick',function(){
        $(this).data('thread').lines().toggle();
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
  var i=-1;
  function threadFinish(){
    if(thread){
      thread.finish(i);
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
      thread = oneThreadDump.newThread(m[2], m[1], m[3], line);
    }),
    new Checker(/^$/,function(m,line){
      threadFinish();
    }),
    new Checker(/^\s+java.lang.Thread.State: ([A-Z_]+)/,function(m,line){
      thread.addState(m[1],line);
    }),
    new Checker(/^Heap/,function(m,line){
      threadFinish();
      next = findThreadDump;
      oneThreadDump.finish(i);
      preThreadDump = oneThreadDump;
      oneThreadDump = null;
    })
  ];
  function parseThreadDump(){
    var find = false;
    for(var j=0;j<checkers.length; j++){
      if(checkers[j].test(line)){
        find=true;
        break;
      }
    }
    if(find===false){
      console.log("unexpected line "+i+":"+line);
    }
  }
  function findThreadDump(){
    if(i>0 && /^Full thread dump/.test(line) && /^\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d$/.test(lines[i-1])){
      oneThreadDump = ThreadDump(preThreadDump, lines[i-1], line, i);
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
    lines:lines,
    lineNumber:function(){
      return i;
    },
    hasNext:function(){
      return i<lines.length;
    },
    next:function(){
      i++;
      line = lines[i];
      try{
        next();
      }catch(e){
        console.log("i=",i);
        console.log("line=",lines[i-2]);
        console.log("line=",lines[i-1]);
        console.log("line=",lines[i]);
        console.log("line=",lines[i+1]);
        console.log("line=",lines[i+2]);
        console.log("thread=",thread);
        throw e;
      }
    }
  };
}
function parse(lines,div){
  var p = Parser(lines,div);
  var parseState = $("<div>");
  div.append(parseState);
  function doParse(){
    for(var i=0;i<1000 && p.hasNext(); i++){
      p.next();
    }
    parseState.text("parse end "+p.lineNumber()+"/"+p.lines.length+" lines");
    if(p.hasNext()){
      setTimeout(doParse);
    }else{
      parseState.remove();
    }
  }
  doParse();
}
