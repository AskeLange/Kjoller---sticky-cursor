

// Imports
import { GPU } from 'gpu.js';
import BezierEasing from 'bezier-easing';
import './styling/base.scss';


// Cursor class
class Cursor {

  // Initilization
  // Constructor
  constructor () {

    // Fields
    // Dimensions
    let w, h;
    this.width = w = window.innerWidth;
    this.height = h = window.innerHeight;
    this.mx = w/2; this.my = h/2;

    // Color
    this.init_r = .72;
    this.init_g = .86;
    this.init_b = .88;

    this.r = this.init_r;
    this.g = this.init_g;
    this.b = this.init_b;

    // Modifiers
    this.stickyness = 112;
    this.particle_distance = 1300;
    this.particle_speed = 1800;

    // Transition timer and state
    this.transitioning_out = false;
    this.transition_start = (new Date ()).getTime ();
    this.transition_done = false;

    // Attracted, start and std points
    this.length = 3; this.attracted = false;
    this.s_points = [[w/2, h/2], [w/2, h/2], [w/2, h/2]];
    this.a_points = [[w/2, h/2], [w/2, h/2], [w/2, h/2]];
    this.points = [[w/2, h/2], [w/2, h/2], [w/2, h/2]];


    // Initilizes kernel
    this.gpu = new GPU ();
    this.applySmoothUnion ();
    this.render = this.gpu.createKernel (this.renderKernel)
      .setOutput ([ w, h ])
      .setDynamicOutput (true)
      .setGraphical (true);

    // Nodes
    this.render (this.points, this.length, 
      this.stickyness, this.r, this.g, this.b);

    this.canvas_node = this.render.canvas;
    this.prim_node = document.createElement ('div');
    this.prim_node.id = 'prim-cursor';


    // Applies event listeners
    window.addEventListener ('resize', this.onResize.bind (this));
    window.addEventListener ('mousemove', this.onMouseMove.bind (this));

  }


  // Loop events
  // Update
  // (Animation loop)
  update () {

    // Loops around
    requestAnimationFrame (this.update.bind (this));

    // Interpolates points
    if (!this.attracted && !this.transitioning_out) {

      /* ---- NORMAL TRANSIITION ---- */
      // Point two to one
      // Fetches info
      let p1 = this.points [0];
      let p2 = this.points [1];

      // Calculates direction and distance
      let dx = p1[0] - p2[0];
      let dy = p1[1] - p2[1];
      let dir = Math.atan2 (dy, dx);
      let dis = Math.sqrt (dx*dx + dy*dy);

      // Calculates the speed
      let t = Math.min (dis / this.particle_distance, 1);
      let speed = this.particle_speed * ((t*t * (3.0 - 2.0 * t)) * 1.0 + 0.0);

      // Sets new point coordinates
      this.points[1][0] += Math.cos (dir) * speed;
      this.points[1][1] += Math.sin (dir) * speed;

      if (dis-speed <= .1) {
        this.points[1][0] = p1[0];
        this.points[1][1] = p1[1];
      }

    /* ---- ATTRACTED TRANSIITION ---- */
    } else if (this.attracted) {

      // Sets new positions
      for (let n = 0; n < this.points.length; n ++) {

        // Interpolates point
        let position = this.interpolatePoint (
          this.s_points [n],
          this.a_points [n],
          3000
        );

        // Calculates mouse modifier
        let mdx = this.mx - position[0];
        let mdy = (this.height - this.my) - position[1];
        let mdir = Math.atan2 (mdy, mdx);
        let mdis = Math.sqrt (mdx*mdx + mdy*mdy);

        let speed =  mdis / 20 * ((n+1)*1.1);
        let nmx = Math.cos (mdir) * speed;
        let nmy = Math.sin (mdir) * speed;
        if (mdis - speed <= 0) break;

        // Sets new position
        if (position[2] < 1) {
          this.points[n][0] = position[0] + nmx;
          this.points[n][1] = position[1] + nmy;
        } else {
          this.points[n][0] = this.a_points[n][0] + nmx;
          this.points[n][1] = this.a_points[n][1] + nmy;
        }

      }

    /* ---- TRANSITIONING OUT ---- */
    } else if (this.transitioning_out) {

      // Loops through points
      for (let n = 0; n < this.points.length; n ++) {

        // Sets goal points
        let g_point = [this.mx, this.height - this.my];
        if (n == 1) g_point = this.points[0].concat ([ ]);

        // Interpolates point
        let position = this.interpolatePoint (
          this.s_points [n],
          g_point,
          n != 1 ? 3000 : 15000
        );
        
        // Sets trans out and new points
        if (position[3] <= .1) this.transitioning_out = false;
        this.points [n][0] = position[0];
        this.points [n][1] = position[1];

      }

    }

    // Renders
    this.render (
      this.points, 
      this.length, 
      this.stickyness,
      this.r,
      this.g,
      this.b
    );
    
  }

  // Render Kernel
  renderKernel (points, length, stickyness, r, g, b) {

    // Constants
    const radius = 4;
    const outline = 1;

    // Coordinates
    let x = this.thread.x;
    let y = this.thread.y;

    // Calculates initial smoothed value
    let dx1 = points[0][0] - x;
    let dy1 = points[0][1] - y;
    let dx2 = points[1][0] - x;
    let dy2 = points[1][1] - y;

    let dis1 = Math.sqrt (dx1*dx1 + dy1*dy1);
    let dis2 = Math.sqrt (dx2*dx2 + dy2*dy2);
    let s = smooth_union (dis1, dis2, stickyness);

    // Calculates total smoothed value
    for (let n = 2; n < length; n ++ ) {

      let dx = points[n][0] - x;
      let dy = points[n][1] - y;
      let dis = Math.sqrt (dx*dx + dy*dy);
      s = smooth_union (s, dis, stickyness);

    }

    // Calculates outline
    // (Antialiasing, sorta)
    let outl = ((s-radius) / outline);
    let or = r + ((1-r) * outl);
    let og = g + ((1-g) * outl);
    let ob = b + ((1-b) * outl);

    // Colors pixel 
    if (s <= radius) { this.color (r,g,b,1) }
    else if (s-radius <= outline ) { this.color (or, og, ob, 1); }
    else { this.color (1,1,1,1); }

  }


  // Actions
  // Start
  start () {
    
    // Appends node to body n' starts loop
    document.body.appendChild (this.canvas_node);
    document.body.appendChild (this.prim_node);
    this.applyAttraction ();
    this.update ();

  }

  // Stop
  stop () {
    
    // Unloads gpu n' kernel
    this.render.destroy ();
    this.gpu.destroy ();

  }

  // Apply Attractiom
  applyAttraction () {

    // Fetches dom nodes n' loops over them
    let nodes = document.querySelectorAll ('.attraction');
    this.attraction_nodes = nodes;
    for (let n = 0; n < nodes.length; n ++) {

      // Applies the events
      nodes [n].addEventListener ('mouseenter', this.onMouseEnter.bind (this));
      nodes [n].addEventListener ('mouseleave', this.onMouseLeave.bind (this));

    }

  }

  // Reapply attraction
  repapplyAttraction () {

    // Removes attraction evenets
    let nodes = this.attraction_nodes;
    for (let n = 0; n < nodes.length; n ++) {
      nodes [n].removeEventListener ('mouseenter', this.onMouseEnter.bind (this));
      nodes [n].removeEventListener ('mouseleave', this.onMouseLeave.bind (this));
    }

    // Reapplies events
    this.applyAttraction ();

  }


  // Native events
  // On resize
  onResize (e) {
    
    // Resizes canvas
    // (or well, the kernel)
    this.render.setOutput ([
      window.innerWidth,
      window.innerHeight
    ]);

  }

  // On mouse move
  onMouseMove (e) {

    // Captures mouse coords,
    // and sets prim_nodes coords
    this.mx = e.clientX;
    this.my = e.clientY;
    this.prim_node.style.left = `${this.mx}px`;
    this.prim_node.style.top = `${this.my}px`;

    // Sets point coords
    if (!this.attracted && !this.transitioning_out) {

      this.points[0][0] = this.mx;
      this.points[0][1] = this.height - this.my;
      this.points[2][0] = this.points [0][0];
      this.points[2][1] = this.points [0][1];
      
    }

  }

  // On mouse enter
  onMouseEnter (e) {

    // Fetches attracted location
    let rect = e.target.getBoundingClientRect ();
    let x = rect.left, y = rect.top, h = this.height;

    // Sets affected fields
    this.attracted = true;
    this.a_points[0] = [(x + 50), h - (y - 6)];
    this.a_points[1] = [(x + 20), h - (y + 46)];
    this.a_points[2] = [(x + 84), h - (y + 54)];

    this.s_points = this.points.concat ([ ]);
    this.transition_start = (new Date ()).getTime ();
    
  }

  // On mouse leave
  onMouseLeave (e) {

    this.attracted = false;
    this.transitioning_out = true;
    this.transition_start = (new Date ()).getTime ();
    this.s_points = this.points.concat ([ ]);

  }


  // Tools
  // Apply smooth union
  applySmoothUnion () {
    this.gpu.addFunction (function smooth_union (a, b, stickyness) {

      let v = .5 + .5 * (b - a) / stickyness;
      let h = Math.max (0, Math.min (1, v));
      return (b * (1 - h) + a * h) - stickyness * h * (1-h);

    });
  }

  // Interpolate points
  interpolatePoint (start, goal, trans_time) {

    // Time perc
    let easing = BezierEasing (.0, .5, .5, 1.0);
    let perc = ((new Date ()).getTime () - this.transition_start) / trans_time;
    let dis_perc = (1-easing (perc));

    // Calculates direction and distance
    let dx = goal[0] - start[0];
    let dy = goal[1] - start[1];
    let dir = Math.atan2 (dy, dx);
    let dis = Math.sqrt (dx*dx + dy*dy);

    // Calculates new coords and returns
    let nx = goal [0] - (Math.cos (dir) * (dis * dis_perc));
    let ny = goal [1] - (Math.sin (dir) * (dis * dis_perc));
    return [ nx, ny, perc, dis_perc ];

  }

};


// Main entry point
// Creates instance n'
// applies event listeners
let cursor = new Cursor ();
window.addEventListener ('load', cursor.start.bind (cursor));
window.addEventListener ('beforeunload', cursor.stop.bind (cursor));