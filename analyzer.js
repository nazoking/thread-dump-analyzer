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
  var div = $('<div class="thread tid-'+threadId+'"><span class="state"/>').append($("<span>").text('"'+threadName+'" '+condition));
  var lines = [titleLine];
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
      var s = div.find(".state");
      $.each(this.preThreads(),function(){
        $('<span class="prethread-'+this.state+'">').text((this.state||"").charAt(0)).appendTo(s);
      });
      div.addClass("state-"+state);
    },
    addWaiting:function(objectId,line){
      lines.push(line);
      div.append($('<div>').text(line));
      div.addClass("waiting-"+objectId);
      threads.addWaiting(objectId,this);
    },
    addStackTrace:function(line){
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
        $.map(this.preThreads(),function(t){
          var pre = $("<pre>").text(t.threadDump.time);
          $.each(t.linesData,function(i){
            $("<div class='line' data-ln="+i+">").text(this).appendTo(pre);
          });
          if(t.preThread){
            var i = 1;
            var pr;
            var cur;
            while((pr=t.preThread.linesData[t.preThread.linesData.length - i])!==undefined &&
              (cur=t.linesData[t.linesData.length - i])!==undefined){
              if(pr===cur){
                pre.find("div[data-ln="+(t.linesData.length - i)+"]").addClass("longprocess");
              }else{
                break;
              }
              i++;
            }
          }
          pre.appendTo(txt);
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
          div.find(".locked-"+lockInfo.objectId).find(".count").text(lockInfo.waitings.length+" waiting)");
          threads.div.find('.waiting-'+lockInfo.objectId).addClass('blocked');
          div.addClass('blocking');
        }
      }
    }
  };
  div.data('thread',self);
  return self;
}
function ThreadDump(preThreadDump, time, head){
  var div = $("<div class='threads'>");
  var lockes = {};
  var threadList={};
  var threadSize=0;
  var header = $("<div class='header'>").text(time+"====="+head);
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
    finish:function(){
      var btn = $('<button>').text("show/hide blocked("+div.find('.blocked').length+")").click(function(){
        div.find('.blocked').toggle();
      });
      var t = $('<div>').text('Thread size='+threadSize).append(btn).appendTo(header);
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
function Parser(lines,div){
  var threadStart = /^"([^"]+?)" (?:daemon )?prio=\d+.* tid=(0x[a-f0-9]+)(?:\s+[a-zA-Z0-9_]+=0x[a-f0-9]+)*\s+([^\[]+)(?:\[|$)/;
  var waitingToLock = /^\s+- waiting to lock <(0x[a-f0-9]+)>/;
  var locked = /^\s+- locked <(0x[a-f0-9]+)>/;
  var state =  /^\s+java.lang.Thread.State: ([A-Z_]+)/;
  var stackTrace = /^\s+at [a-zA-Z0-9_$.]/;
  var parkingWait = /^\s+- parking to wait for \s*<(0x[a-f0-9]+)>/;
  var waitingOn =  /^\s+- waiting on <(0x[a-f0-9]+)>/;
  var startThreadDump1 =  /^\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d$/;
  var startThreadDump2 =  /^Full thread dump/;
  var heap = /^Heap/;

  var thread = null;
  var oneThreadDump = null;
  var preThreadDump = null;
  var i=-1;
  var line;
  function parseThreadDump(){
    var m;
    if(line===""){
      thread = null;
      return;
    }
    m = threadStart.exec(line);
    if(m){
      thread = oneThreadDump.newThread(m[2], m[1], m[3], line);
      return;
    }
    m = state.exec(line);
    if(m){
      thread.addState(m[1],line);
      return;
    }
    m = waitingToLock.exec(line);
    if(m){
      thread.addWaiting(m[1],line);
      return;
    }
    m = parkingWait.exec(line);
    if(m){
      thread.addWaiting(m[1],line);
      return;
    }
    m = waitingOn.exec(line);
    if(m){
      thread.addWaiting(m[1],line);
      return;
    }
    m = locked.exec(line);
    if(m){
      thread.addLocked(m[1],line);
      return;
    }
    m = stackTrace.exec(line);
    if(m){
      thread.addStackTrace(line);
      return;
    }
    if(heap.test(line)){
      next = findThreadDump;
      oneThreadDump.finish();
      preThreadDump = oneThreadDump;
      oneThreadDump = null;
      return;
    }
    console.log("unexpected line "+i+":"+line);
  }
  function findThreadDump(){
    if(i>0 && startThreadDump2.test(line) && startThreadDump1.test(lines[i-1])){
      oneThreadDump = ThreadDump(preThreadDump, lines[i-1],line);
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
