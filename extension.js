const {Clutter, St, Meta, Shell} = imports.gi;
const Cairo = imports.cairo;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const COLORS = [[1,.25,.25],[1,.82,.15],[.2,.85,.45],[.25,.65,1],[1,1,1],[.05,.05,.05]];
class ScreenSketch {
    enable() {
        this._settings = ExtensionUtils.getSettings();
        Main.wm.addKeybinding('toggle-sketch', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this._open());
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._close());
    }
    disable() {
        this._close();
        Main.wm.removeKeybinding('toggle-sketch');
        Main.layoutManager.disconnect(this._monitorSignal);
        this._settings = null;
    }
    _open() {
        if (this._overlay) { this._close(); return; }
        this._strokes = []; this._redo = []; this._active = null;
        this._color = 0; this._width = 4; this._tool = 'pen';
        const root = new St.Widget({reactive:true, can_focus:true, layout_manager:new Clutter.FixedLayout()});
        this._overlay = root;
        root.set_position(0,0); root.set_size(global.stage.width,global.stage.height);
        this._canvas = new St.DrawingArea({reactive:false});
        this._canvas.set_size(global.stage.width,global.stage.height);
        root.add_child(this._canvas);
        this._canvas.connect('repaint', area => this._paint(area));
        const mon = Main.layoutManager.currentMonitor || Main.layoutManager.primaryMonitor;
        this._bar = new St.BoxLayout({vertical:true, reactive:true, style:'background-color: rgba(24,24,28,0.96); border: 1px solid #555; border-radius: 12px; padding: 10px 14px; spacing: 6px;'});
        root.add_child(this._bar);
        const header = new St.BoxLayout({style:'spacing: 16px;'});
        this._bar.add_child(header);
        this._hint = new St.Label({y_align:Clutter.ActorAlign.CENTER, x_expand:true});
        header.add_child(this._hint);
        const dismiss = new St.Button({label:'×  Hide (H)', can_focus:false, style:'color: #ddd; font-size: 12px; padding: 3px 8px; border-radius: 6px; background-color: #444;'});
        header.add_child(dismiss);
        dismiss.connect('clicked', () => { this._bar.hide(); root.grab_key_focus(); });
        // Prevent drawing behind the guide, while allowing its button to work.
        this._bar.connect('button-press-event', () => Clutter.EVENT_STOP);
        this._bar.connect('button-release-event', () => Clutter.EVENT_STOP);
        const rows = [
            [['Esc','Close overlay'], ['P','Freehand pen'], ['L','Straight line'], ['R','Rectangle']],
            [['A','Arrow'], ['1–6','Change color'], ['+ / −','Thickness'], ['C','Clear canvas']],
            [['Ctrl+Z','Undo'], ['Ctrl+Y','Redo'], ['H','Toggle guide']]
        ];
        for (const entries of rows) {
            const row = new St.BoxLayout({style:'spacing: 16px;'});
            this._bar.add_child(row);
            for (const [key, description] of entries) {
                const item = new St.BoxLayout({style:'spacing: 5px;'});
                item.add_child(new St.Label({text:key, style:'color: white; font-weight: bold; font-size: 11px; background-color: #45454d; border-radius: 4px; padding: 3px 6px;', y_align:Clutter.ActorAlign.CENTER}));
                item.add_child(new St.Label({text:description, style:'color: #ddd; font-size: 11px;', y_align:Clutter.ActorAlign.CENTER}));
                row.add_child(item);
            }
        }
        this._update();
        const positionGuide = () => {
            const [, width] = this._bar.get_preferred_width(-1);
            const [, height] = this._bar.get_preferred_height(width);
            this._bar.set_position(mon.x + Math.max(0, Math.floor((mon.width-width)/2)), mon.y + mon.height-height-20);
        };
        positionGuide();
        this._bar.connect('notify::width', positionGuide);
        this._bar.connect('notify::height', positionGuide);
        root.connect('button-press-event', (_,e) => this._press(e));
        root.connect('motion-event', (_,e) => this._motion(e));
        root.connect('button-release-event', (_,e) => { if(e.get_button()===1) this._active=null; return Clutter.EVENT_STOP; });
        root.connect('key-press-event', (_,e) => this._key(e));
        Main.uiGroup.add_child(root);
        try {
            this._grab = Main.pushModal(root, {actionMode:Shell.ActionMode.SYSTEM_MODAL});
            if (this._grab.get_seat_state() !== Clutter.GrabState.ALL) { this._close(); return; }
            root.grab_key_focus();
        } catch(e) { this._close(); console.error(e); }
    }
    _close() {
        if (!this._overlay) return;
        if (this._grab) { Main.popModal(this._grab); this._grab=null; }
        this._overlay.destroy(); this._overlay=null; this._canvas=null; this._active=null; this._strokes=[]; this._redo=[];
    }
    _update() {
        this._hint.text = `QuickSketch  •  ${this._tool.toUpperCase()} / ${this._width}px`;
        const c=COLORS[this._color].map(v=>Math.round(v*255));
        this._hint.set_style(`color: white; font-size: 12px; border-left: 5px solid rgb(${c.join(',')}); padding-left: 8px;`);
    }
    _point(e) { const [x,y]=e.get_coords(); return [x,y]; }
    _press(e) {
        if(e.get_button()!==1) return Clutter.EVENT_STOP;
        const p=this._point(e);
        this._active={tool:this._tool,color:COLORS[this._color],width:this._width,points:[p,p]};
        this._strokes.push(this._active); this._redo=[]; this._canvas.queue_repaint();
        return Clutter.EVENT_STOP;
    }
    _motion(e) {
        if(this._active) {
            const p=this._point(e);
            if(this._active.tool==='pen') this._active.points.push(p); else this._active.points[1]=p;
            this._canvas.queue_repaint();
        }
        return Clutter.EVENT_STOP;
    }
    _key(e) {
        const k=e.get_key_symbol(); const ctrl=Boolean(e.get_state() & Clutter.ModifierType.CONTROL_MASK);
        if(k===Clutter.KEY_Escape) {this._close(); return Clutter.EVENT_STOP;}
        const ch=String.fromCharCode(k).toLowerCase();
        this._active=null;
        if(ctrl && ch==='z') { if(this._strokes.length) this._redo.push(this._strokes.pop()); }
        else if(ctrl && ch==='y') {if(this._redo.length) this._strokes.push(this._redo.pop());}
        else if(ch==='h') { if(this._bar.visible) this._bar.hide(); else this._bar.show(); }
        else if(ch==='c') {this._strokes=[];this._redo=[];}
        else if('plra'.includes(ch)) {this._tool={p:'pen',l:'line',r:'rectangle',a:'arrow'}[ch];}
        else if(ch>='1' && ch<='6') this._color=Number(ch)-1;
        else if(ch==='+' || ch==='=') this._width=Math.min(40,this._width+2);
        else if(ch==='-') this._width=Math.max(2,this._width-2);
        this._update();this._canvas.queue_repaint();return Clutter.EVENT_STOP;
    }
    _paint(area) {
        const cr=area.get_context();
        try {
            cr.setLineCap(Cairo.LineCap.ROUND); cr.setLineJoin(Cairo.LineJoin.ROUND);
            for(const s of this._strokes) {
                const [x,y]=s.points[0];const [u,v]=s.points[s.points.length-1];
                cr.setSourceRGB(...s.color);cr.setLineWidth(s.width);
                if(s.tool==='rectangle') cr.rectangle(Math.min(x,u),Math.min(y,v),Math.abs(u-x),Math.abs(v-y));
                else {
                    cr.moveTo(x,y);
                    for(const [px,py] of s.points.slice(1)) cr.lineTo(px,py);
                    if(s.tool==='arrow' && Math.hypot(u-x,v-y)>1) {
                        const a=Math.atan2(v-y,u-x), n=Math.max(14,s.width*4);
                        for(const d of [-.5,.5]) {cr.moveTo(u,v);cr.lineTo(u-n*Math.cos(a+d),v-n*Math.sin(a+d));}
                    }
                }
                cr.stroke();
                if(x===u && y===v && s.tool==='pen') {cr.arc(x,y,s.width/2,0,2*Math.PI);cr.fill();}
            }
        } finally {cr.$dispose();}
    }
}

function init() { return new ScreenSketch(); }
