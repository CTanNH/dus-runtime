struct Globals {
  frame: vec4<f32>,
  cursor: vec4<f32>,
  interaction: vec4<f32>,
  camera: mat4x4<f32>,
  camera_inv: mat4x4<f32>,
  render: vec4<f32>,
}

struct PanelOut {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) world: vec2<f32>,
  @location(2) half_size: vec2<f32>,
  @location(3) style0: vec4<f32>,
  @location(4) style1: vec4<f32>,
}

struct ContentOut {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) world: vec2<f32>,
  @location(2) half_size: vec2<f32>,
  @location(3) uv_rect: vec4<f32>,
  @location(4) style0: vec4<f32>,
  @location(5) style1: vec4<f32>,
}

@group(0) @binding(0) var<uniform> U: Globals;
@group(1) @binding(0) var media_sampler: sampler;
@group(1) @binding(1) var media_texture: texture_2d<f32>;

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn quad_vertex(vertex_index: u32) -> vec2<f32> {
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, 1.0)
  );
  return quad[vertex_index];
}

fn sd_round_box(p: vec2<f32>, half_size: vec2<f32>, radius: f32) -> f32 {
  let q = abs(p) - half_size + vec2<f32>(radius, radius);
  return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

fn safe_normalize(v: vec2<f32>) -> vec2<f32> {
  let len2 = dot(v, v);
  if (len2 < 1.0e-8) {
    return vec2<f32>(0.0, 0.0);
  }
  return v * inverseSqrt(len2);
}

fn inverse_rho3(rho2: f32) -> f32 {
  let inv_rho = inverseSqrt(rho2);
  return inv_rho * inv_rho * inv_rho;
}

fn median3(value: vec3<f32>) -> f32 {
  return max(min(value.x, value.y), min(max(value.x, value.y), value.z));
}

fn camera_scale() -> f32 {
  return max(max(abs(U.camera[0].x), abs(U.camera[1].y)), 1.0e-4);
}

fn world_aa(base: f32) -> f32 {
  return max(base / camera_scale(), 0.0025);
}

fn bevel_normal(local: vec2<f32>, half_size: vec2<f32>, stiffness: f32) -> vec3<f32> {
  let nx = clamp(local.x / max(half_size.x, 1.0e-4), -1.0, 1.0);
  let ny = clamp(local.y / max(half_size.y, 1.0e-4), -1.0, 1.0);
  return normalize(vec3<f32>(
    -nx * mix(0.82, 0.38, stiffness),
    ny * mix(0.82, 0.38, stiffness),
    1.28 + 1.02 * stiffness
  ));
}

fn field_pullback(world_p: vec2<f32>, confidence: f32, stiffness: f32) -> vec2<f32> {
  let cursor_delta = world_p - U.cursor.xy;
  let cursor_r2 = dot(cursor_delta, cursor_delta) + 0.120;
  let gravity = (0.004 + 0.026 * U.interaction.x)
    * mix(0.90, 0.14, stiffness)
    * cursor_delta
    * inverse_rho3(cursor_r2);

  let velocity = U.cursor.zw;
  let velocity2 = dot(velocity, velocity) + 0.080;
  let shear = mix(0.22, 0.05, stiffness)
    * dot(velocity, cursor_delta)
    * velocity
    / (velocity2 * cursor_r2 + 0.120);

  let click_push = 0.008
    * U.interaction.y
    * exp(-2.2 * U.interaction.z)
    * mix(0.80, 0.16, stiffness)
    * safe_normalize(cursor_delta)
    / (0.22 + cursor_r2);

  let flow = gravity + shear + click_push;
  let max_len = mix(0.12, 0.035, stiffness) + 0.02 * (1.0 - confidence);
  let len2 = dot(flow, flow);
  if (len2 > max_len * max_len) {
    return flow * (max_len * inverseSqrt(max(len2, 1.0e-8)));
  }
  return flow;
}

fn role_tint(role: f32, confidence: f32) -> vec3<f32> {
  if (role < 0.5) {
    return mix(vec3<f32>(0.42, 0.58, 0.94), vec3<f32>(0.78, 0.90, 1.0), confidence);
  }
  if (role < 1.5) {
    return mix(vec3<f32>(0.40, 0.64, 0.92), vec3<f32>(0.74, 0.90, 1.0), confidence);
  }
  if (role < 2.5) {
    return mix(vec3<f32>(0.30, 0.62, 0.82), vec3<f32>(0.70, 0.92, 0.98), confidence);
  }
  if (role < 3.5) {
    return mix(vec3<f32>(0.62, 0.70, 0.90), vec3<f32>(0.84, 0.90, 1.0), confidence);
  }
  if (role < 4.5) {
    return mix(vec3<f32>(0.96, 0.34, 0.24), vec3<f32>(0.92, 0.66, 0.58), confidence);
  }
  if (role < 5.5) {
    return mix(vec3<f32>(0.32, 0.72, 0.92), vec3<f32>(0.84, 0.94, 1.0), confidence);
  }
  return mix(vec3<f32>(0.88, 0.42, 0.26), vec3<f32>(0.46, 0.68, 0.98), confidence);
}

fn panel_half_size(size: vec2<f32>, confidence: f32, stiffness: f32, field_mode: bool) -> vec2<f32> {
  if (field_mode) {
    let softness = 1.0 - stiffness;
    return size * 0.5 + vec2<f32>(0.04 + 0.06 * softness, 0.04 + 0.09 * softness);
  }
  return size * 0.5;
}

fn panel_corner(size: vec2<f32>, stiffness: f32, field_mode: bool) -> f32 {
  let base = max(size.x, size.y);
  if (field_mode) {
    return 0.05 * base + 0.10 * (1.0 - stiffness) + 0.06;
  }
  return 0.034 * base + 0.05;
}

@vertex
fn vs_panel_current(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) pose: vec4<f32>,
  @location(1) target_pose: vec4<f32>,
  @location(2) style0: vec4<f32>,
  @location(3) style1: vec4<f32>
) -> PanelOut {
  let local = quad_vertex(vertex_index) * pose.zw * 0.5;
  let world = pose.xy + local;
  let clip = U.camera * vec4<f32>(world, 0.0, 1.0);

  var out: PanelOut;
  out.position = vec4<f32>(clip.xy, 0.0, 1.0);
  out.local = local;
  out.world = world;
  out.half_size = pose.zw * 0.5;
  out.style0 = style0;
  out.style1 = style1;
  return out;
}

@vertex
fn vs_panel_target(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) pose: vec4<f32>,
  @location(1) target_pose: vec4<f32>,
  @location(2) style0: vec4<f32>,
  @location(3) style1: vec4<f32>
) -> PanelOut {
  let local = quad_vertex(vertex_index) * target_pose.zw * 0.5;
  let world = target_pose.xy + local;
  let clip = U.camera * vec4<f32>(world, 0.0, 1.0);

  var out: PanelOut;
  out.position = vec4<f32>(clip.xy, 0.0, 1.0);
  out.local = local;
  out.world = world;
  out.half_size = target_pose.zw * 0.5;
  out.style0 = style0;
  out.style1 = style1;
  return out;
}

fn build_content_out(
  vertex_index: u32,
  pose: vec4<f32>,
  uv_rect: vec4<f32>,
  style0: vec4<f32>,
  style1: vec4<f32>
) -> ContentOut {
  let local = quad_vertex(vertex_index) * pose.zw * 0.5;
  let world = pose.xy + local;
  let clip = U.camera * vec4<f32>(world, 0.0, 1.0);

  var out: ContentOut;
  out.position = vec4<f32>(clip.xy, 0.0, 1.0);
  out.local = local;
  out.world = world;
  out.half_size = pose.zw * 0.5;
  out.uv_rect = uv_rect;
  out.style0 = style0;
  out.style1 = style1;
  return out;
}

@vertex
fn vs_text(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) pose: vec4<f32>,
  @location(1) uv_rect: vec4<f32>,
  @location(2) style0: vec4<f32>,
  @location(3) style1: vec4<f32>
) -> ContentOut {
  return build_content_out(vertex_index, pose, uv_rect, style0, style1);
}

@vertex
fn vs_image(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) pose: vec4<f32>,
  @location(1) uv_rect: vec4<f32>,
  @location(2) style0: vec4<f32>,
  @location(3) style1: vec4<f32>
) -> ContentOut {
  return build_content_out(vertex_index, pose, uv_rect, style0, style1);
}

@fragment
fn fs_panel(in: PanelOut) -> @location(0) vec4<f32> {
  let confidence = clamp(in.style0.x, 0.0, 1.0);
  let importance = clamp(in.style0.y, 0.0, 1.0);
  let stiffness = clamp(in.style0.z, 0.18, 1.0);
  let kind_flag = in.style0.w;
  let role = in.style1.x;
  let focus = saturate(in.style1.y);
  let selected = saturate(in.style1.z);
  let heat = saturate(in.style1.w);
  let field_mode = U.render.x > 0.5;
  let is_text = kind_flag < 0.5;

  let half_size = panel_half_size(in.half_size * 2.0, confidence, stiffness, field_mode);
  let corner = panel_corner(in.half_size * 2.0, stiffness, field_mode);
  let pull = select(vec2<f32>(0.0, 0.0), field_pullback(in.world, confidence, stiffness), field_mode);
  let local = in.local - pull * mix(0.58, 0.12, stiffness);
  let sd = sd_round_box(local, half_size, corner);
  let aa = world_aa(select(0.010, 0.018, field_mode));
  let normal = bevel_normal(local, half_size, stiffness);
  let light = normalize(vec3<f32>(-0.28, 0.68, 1.0));
  let view = vec3<f32>(0.0, 0.0, 1.0);
  let half_vector = normalize(light + view);
  let diffuse = max(dot(normal, light), 0.0);
  let specular = pow(max(dot(normal, half_vector), 0.0), mix(18.0, 68.0, confidence));
  let rim = pow(1.0 - max(dot(normal, view), 0.0), 2.0);
  let alpha = 1.0 - smoothstep(-aa, aa, sd);
  let tone = role_tint(role, confidence);
  let border = 1.0 - smoothstep(0.0, aa * 4.0 + 0.006, abs(sd));
  let halo = exp(-10.0 * abs(sd)) * max(focus, selected);
  let heat_mix = saturate(heat * U.render.y);

  if (!field_mode && is_text) {
    let outline_alpha = border * (0.015 + 0.16 * max(focus, selected) + 0.06 * heat_mix);
    let ambient_alpha = alpha * (0.01 + 0.02 * importance);
    let text_shell_alpha = max(outline_alpha, ambient_alpha) + halo * 0.06;
    if (text_shell_alpha <= 1.0e-4) {
      discard;
    }
    let shell_color = mix(vec3<f32>(0.08, 0.10, 0.14), tone, 0.12 + 0.18 * max(focus, selected));
    return vec4<f32>(shell_color, text_shell_alpha);
  }

  if (alpha <= 1.0e-4) {
    discard;
  }

  if (!field_mode) {
    var fill = mix(vec3<f32>(0.10, 0.12, 0.17), vec3<f32>(0.92, 0.95, 0.99), 0.84);
    fill = mix(fill, fill + 0.12 * tone, 0.55 + 0.20 * importance);
    fill = mix(fill, vec3<f32>(0.98, 0.48, 0.28), heat_mix * 0.42);
    let color = fill + border * 0.12 * tone + halo * 0.18 * tone;
    return vec4<f32>(color, alpha);
  }

  let warm = vec3<f32>(0.94, 0.36, 0.24);
  let cold = vec3<f32>(0.24, 0.58, 0.98);
  let signal = mix(warm, cold, confidence);
  var fluid = mix(vec3<f32>(0.15, 0.17, 0.22), vec3<f32>(0.20, 0.22, 0.28) + 0.50 * signal, 0.84);
  fluid = fluid + 0.16 * diffuse * tone + 0.76 * specular + 0.12 * rim;
  fluid = mix(fluid, warm, heat_mix * 0.34);
  if (is_text) {
    let text_shell = mix(vec3<f32>(0.07, 0.09, 0.13), tone, 0.20 + 0.18 * confidence);
    let text_alpha = alpha * (0.08 + 0.08 * importance + 0.16 * max(focus, selected));
    let text_color = text_shell + halo * 0.10 * tone + border * 0.03;
    return vec4<f32>(text_color, text_alpha);
  }
  let color = fluid + halo * 0.16 * tone + border * 0.05;
  return vec4<f32>(color, alpha);
}

@fragment
fn fs_panel_target(in: PanelOut) -> @location(0) vec4<f32> {
  let sd = sd_round_box(in.local, in.half_size, 0.04 * max(in.half_size.x * 2.0, in.half_size.y * 2.0) + 0.04);
  let outline = 1.0 - smoothstep(0.008, 0.024, abs(sd));
  let alpha = outline * 0.34;
  if (alpha <= 1.0e-4) {
    discard;
  }
  let tone = role_tint(in.style1.x, in.style0.x);
  return vec4<f32>(tone, alpha);
}

@fragment
fn fs_text(in: ContentOut) -> @location(0) vec4<f32> {
  let confidence = clamp(in.style0.x, 0.0, 1.0);
  let stiffness = clamp(in.style0.z, 0.18, 1.0);
  let role = in.style0.w;
  let selected = saturate(in.style1.x);
  let focus = saturate(in.style1.y);
  let heat = saturate(in.style1.z);
  let distance_range = max(in.style1.w, 1.0);
  let field_mode = U.render.x > 0.5;

  let pull = select(vec2<f32>(0.0, 0.0), field_pullback(in.world, confidence, stiffness), field_mode);
  let local = in.local - pull * mix(0.32, 0.08, stiffness);
  let local_uv = vec2<f32>(
    local.x / max(in.half_size.x * 2.0, 1.0e-5) + 0.5,
    0.5 - local.y / max(in.half_size.y * 2.0, 1.0e-5)
  );
  if (any(local_uv < vec2<f32>(0.0, 0.0)) || any(local_uv > vec2<f32>(1.0, 1.0))) {
    discard;
  }

  let atlas_uv = in.uv_rect.xy + local_uv * (in.uv_rect.zw - in.uv_rect.xy);
  let texel = textureSampleLevel(media_texture, media_sampler, atlas_uv, 0.0);
  let signed_distance = median3(texel.rgb) - 0.5;
  let span = max(in.half_size.x + in.half_size.y, 0.12);
  let screen_px_range = max(distance_range * camera_scale() * span * 0.18, 1.0);
  let alpha = smoothstep(-0.42, 0.42, signed_distance * screen_px_range) * clamp(texel.a, 0.0, 1.0);
  if (alpha <= 1.0e-4) {
    discard;
  }

  let tone = role_tint(role, confidence);
  let warm = vec3<f32>(0.98, 0.54, 0.34);
  let cold = vec3<f32>(0.20, 0.34, 0.62);
  let luminous = mix(vec3<f32>(1.0, 0.80, 0.76), vec3<f32>(0.84, 0.93, 1.0), confidence);
  var text_color = select(mix(warm, cold, confidence), luminous, field_mode);
  text_color = mix(text_color, vec3<f32>(0.98, 0.52, 0.32), heat * U.render.y * 0.22);
  text_color = text_color + tone * select(0.03, 0.08, field_mode) + max(focus, selected) * 0.08 * vec3<f32>(1.0, 1.0, 1.0);
  return vec4<f32>(text_color, alpha);
}

@fragment
fn fs_image(in: ContentOut) -> @location(0) vec4<f32> {
  let confidence = clamp(in.style0.x, 0.0, 1.0);
  let stiffness = clamp(in.style0.z, 0.18, 1.0);
  let role = in.style0.w;
  let selected = saturate(in.style1.x);
  let focus = saturate(in.style1.y);
  let heat = saturate(in.style1.z);
  let field_mode = U.render.x > 0.5;

  let pull = select(vec2<f32>(0.0, 0.0), field_pullback(in.world, confidence, stiffness), field_mode);
  let local = in.local - pull * mix(0.62, 0.10, stiffness);
  let sd = sd_round_box(local, in.half_size, 0.06 * max(in.half_size.x * 2.0, in.half_size.y * 2.0) + 0.05);
  let aa = world_aa(0.012);
  let mask = 1.0 - smoothstep(-aa, aa, sd);
  if (mask <= 1.0e-4) {
    discard;
  }

  let local_uv = vec2<f32>(
    local.x / max(in.half_size.x * 2.0, 1.0e-5) + 0.5,
    0.5 - local.y / max(in.half_size.y * 2.0, 1.0e-5)
  );
  let uv = in.uv_rect.xy + clamp(local_uv, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0)) * (in.uv_rect.zw - in.uv_rect.xy);
  let texel = textureSampleLevel(media_texture, media_sampler, uv, 0.0).rgb;
  let tone = role_tint(role, confidence);
  var color = mix(texel, texel + 0.12 * tone, 0.42);
  color = mix(color, vec3<f32>(0.98, 0.48, 0.32), heat * U.render.y * 0.16);
  color = color + max(focus, selected) * 0.08 * vec3<f32>(1.0, 1.0, 1.0);
  return vec4<f32>(color, mask);
}
