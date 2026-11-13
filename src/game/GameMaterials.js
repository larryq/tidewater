import * as THREE from 'three/webgpu';
import {
	Fn, If, float, vec3, attribute, positionLocal, positionWorld, positionView, normalView, normalLocal,
	cameraPosition, uniform, fract, floor, sin, abs, max, clamp, mix, smoothstep, dot, cross, normalize,
	length, fwidth, atan,
} from 'three/tsl';
import { standard, physical } from '../materials/Materials.js';
import { G } from '../core/Globals.js';

// Materials for the fishing game props. Geometry uses the boat GeoKit layout:
// color = linear albedo, aux = ( roughness, metalness, pattern, animation part ).
//
// This is the TSL counterpart of the native-WebGPU GameMaterials module. The public CPU-facing
// contract deliberately stays compatible with the native version: custom uniforms are exposed as
// material.uniforms.<name>.value so FishingRod can move over without rewriting its state/physics.
export const PAT = {
	plain: 0, wood: 1, cloth: 2, skin: 3, cork: 4, rusty: 5, woodX: 6, woodZ: 7,
	carbon: 8, thread: 9, eva: 10, braid: 11, machined: 12, knurl: 13, rubber: 14,
};

const gpHash = Fn( ( [ p ] ) => fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ).mul( 43758.5453 ) ) );

const gpNoise = Fn( ( [ p ] ) => {

	const i = floor( p );
	const f = fract( p );
	const u = f.mul( f ).mul( vec3( 3 ).sub( f.mul( 2 ) ) );
	const a = mix(
		mix( gpHash( i ), gpHash( i.add( vec3( 1, 0, 0 ) ) ), u.x ),
		mix( gpHash( i.add( vec3( 0, 1, 0 ) ) ), gpHash( i.add( vec3( 1, 1, 0 ) ) ), u.x ),
		u.y,
	);
	const b = mix(
		mix( gpHash( i.add( vec3( 0, 0, 1 ) ) ), gpHash( i.add( vec3( 1, 0, 1 ) ) ), u.x ),
		mix( gpHash( i.add( vec3( 0, 1, 1 ) ) ), gpHash( i.add( vec3( 1, 1, 1 ) ) ), u.x ),
		u.y,
	);
	return mix( a, b, u.z );

} );

const gpFbm = Fn( ( [ p ] ) => gpNoise( p ).mul( 0.55 )
	.add( gpNoise( p.mul( 2.13 ).add( 7.1 ) ).mul( 0.3 ) )
	.add( gpNoise( p.mul( 4.7 ).add( 3.3 ) ).mul( 0.15 ) ) );

// Mikkelsen-style surface-gradient bump, matching the native shader. NodeMaterial normalNode is
// view-space, so use the view-space position/normal just as the older boat materials do.
const gpBump = ( height ) => {

	const dPdx = positionView.dFdx();
	const dPdy = positionView.dFdy();
	const N = normalView;
	const r1 = cross( dPdy, N );
	const r2 = cross( N, dPdx );
	const det = dot( dPdx, r1 );
	const grad = det.sign().mul( height.dFdx().mul( r1 ).add( height.dFdy().mul( r2 ) ) );
	return normalize( det.abs().mul( N ).sub( grad ).add( N.mul( 1e-12 ) ) );

};

function makeUniforms( name, spec = {} ) {

	const out = {};
	for ( const [ key, entry ] of Object.entries( spec ) ) {

		const value = Array.isArray( entry ) ? entry[ 1 ] : entry;
		out[ key ] = uniform( value ).setName( `${ name }_${ key }` );

	}
	return out;

}

function propSurface() {

	const base = attribute( 'color', 'vec3' );
	const aux = attribute( 'aux', 'vec4' );
	// The attribute is the rest position. positionLocal can be deformed by the fishing-rod vertex
	// node; using the raw attribute keeps carbon weave, grip pores, wood grain, etc. glued to parts.
	const lp = attribute( 'position', 'vec3' );
	const P = positionWorld;
	const pat = aux.z;

	const col = base.toVar();
	const rough = aux.x.toVar();
	const height = float( 0 ).toVar();

	If( pat.greaterThan( 0.5 ).and( pat.lessThan( 1.5 ) ).or( pat.greaterThan( 5.5 ) ), () => {

		const q = lp.xzy.toVar();
		If( pat.greaterThan( 6.5 ), () => q.assign( lp.xyz ) )
			.ElseIf( pat.greaterThan( 5.5 ), () => q.assign( lp.yzx ) );

		const grain = gpFbm( vec3( q.x.mul( 40 ), q.y.mul( 40 ), q.z.mul( 1.6 ) ) );
		const rings = sin( q.x.mul( 23 ).add( q.y.mul( 17 ) ).add( grain.mul( 6 ) ).mul( 3 ) ).mul( 0.5 ).add( 0.5 );
		const blotch = gpFbm( P.mul( 1.3 ) );
		col.assign( base.mul( mix( 0.72, 1.12, grain ) ).mul( mix( 0.9, 1.05, rings ) ) );
		col.assign( mix( col, vec3( dot( col, vec3( 0.33 ) ).mul( 1.05 ) ), smoothstep( 0.2, 0.9, normalView.y ).mul( 0.35 ) ) );
		col.mulAssign( mix( 1, 0.72, smoothstep( 0.55, 0.8, blotch ) ) );
		col.mulAssign( mix( 0.75, 1, smoothstep( 0, 0.6, P.y.sub( G.seaLevel ) ) ) );
		const crack = smoothstep( 0.62, 0.7, gpNoise( vec3( q.x.mul( 90 ), q.y.mul( 90 ), q.z.mul( 3 ) ) ) );
		col.mulAssign( float( 1 ).sub( crack.mul( 0.5 ) ) );
		height.assign( grain.mul( 0.0015 ).sub( crack.mul( 0.0012 ) ) );
		rough.assign( clamp( rough.add( grain.sub( 0.5 ).mul( 0.1 ) ), 0.6, 1 ) );

	} ).ElseIf( pat.greaterThan( 1.5 ).and( pat.lessThan( 2.5 ) ), () => {

		const weave = sin( lp.x.mul( 900 ) ).mul( sin( lp.y.mul( 900 ).add( lp.z.mul( 900 ) ) ) )
			.mul( float( 1 ).sub( smoothstep( 0.002, 0.006, fwidth( lp.x.add( lp.y ) ) ) ) );
		const fade = gpFbm( P.mul( 2.5 ) );
		col.assign( base.mul( mix( 0.8, 1.08, fade ) ).mul( weave.mul( 0.04 ).add( 1 ) ) );
		height.assign( weave.mul( 0.0003 ).add( fade.mul( 0.002 ) ) );

	} ).ElseIf( pat.greaterThan( 2.5 ).and( pat.lessThan( 3.5 ) ), () => {

		const b = gpFbm( lp.mul( 22 ) );
		col.assign( base.mul( mix( 0.85, 1.1, b ) ).mul( vec3( 1, mix( 0.94, 1, b ), mix( 0.92, 1, b ) ) ) );
		rough.assign( 0.55 );
		height.assign( b.mul( 0.0008 ) );

	} ).ElseIf( pat.greaterThan( 3.5 ).and( pat.lessThan( 4.5 ) ), () => {

		const s = gpNoise( lp.mul( 700 ) );
		col.assign( base.mul( mix( 0.7, 1.1, s ) ) );
		height.assign( s.mul( 0.0004 ) );

	} ).ElseIf( pat.greaterThan( 4.5 ).and( pat.lessThan( 5.5 ) ), () => {

		const r = smoothstep( 0.55, 0.75, gpFbm( P.mul( vec3( 3, 0.8, 3 ) ) ) );
		col.assign( mix( base, vec3( 0.23, 0.1, 0.04 ), r.mul( 0.8 ) ) );
		rough.assign( mix( rough, 0.85, r ) );

	} ).ElseIf( pat.greaterThan( 7.5 ), () => {

		const ang = atan( lp.x, lp.z );

		If( pat.lessThan( 8.5 ), () => {

			const u = ang.mul( 18 );
			const w = lp.y.mul( 700 );
			const aa = float( 1 ).sub( smoothstep( 0.3, 1.2, fwidth( w ) ) );
			const weave = sin( u.add( w ) ).mul( sin( u.sub( w ) ) );
			col.assign( base.mul( weave.mul( 0.09 ).mul( aa ).add( 1 ) )
				.mul( mix( 0.94, 1.04, gpNoise( vec3( 0, lp.y.mul( 3 ), 0 ) ) ) ) );
			height.assign( weave.mul( 0.00004 ).mul( aa ) );

		} ).ElseIf( pat.lessThan( 9.5 ), () => {

			const w = lp.y.mul( 3200 );
			const aa = float( 1 ).sub( smoothstep( 0.3, 1.2, fwidth( w ) ) );
			const turns = sin( w.add( ang.mul( 0.16 ) ) ).mul( aa );
			col.assign( base.mul( turns.mul( 0.12 ).add( 1 ) ).mul( mix( 0.92, 1.06, gpNoise( lp.mul( 300 ) ) ) ) );
			height.assign( turns.mul( 0.00003 ) );

		} ).ElseIf( pat.lessThan( 10.5 ), () => {

			const pore = smoothstep( 0.72, 0.9, gpNoise( lp.mul( 2600 ) ) );
			const grime = gpFbm( lp.mul( 60 ) );
			col.assign( base.mul( float( 1 ).sub( pore.mul( 0.35 ) ) ).mul( mix( 0.85, 1.08, grime ) ) );
			rough.assign( clamp( rough.sub( grime.mul( 0.12 ) ), 0.55, 1 ) );
			height.assign( pore.mul( - 0.0002 ) );

		} ).ElseIf( pat.lessThan( 11.5 ), () => {

			const w = lp.y.mul( 1500 );
			const u = ang.mul( 60 );
			const aa = float( 1 ).sub( smoothstep( 0.3, 1.2, fwidth( w ) ) );
			const b = sin( u.add( w ) ).mul( 0.5 ).add( 0.5 );
			col.assign( base.mul( mix( 0.8, 1.08, b.mul( aa ).add( float( 0.5 ).mul( float( 1 ).sub( aa ) ) ) ) ) );
			height.assign( b.mul( 0.00006 ).mul( aa ) );

		} ).ElseIf( pat.lessThan( 12.5 ), () => {

			const w = length( lp.xz ).mul( 5000 ).add( lp.y.mul( 800 ) );
			const aa = float( 1 ).sub( smoothstep( 0.3, 1.2, fwidth( w ) ) );
			const mm = sin( w ).mul( aa );
			col.assign( base.mul( mm.mul( 0.03 ).add( 1 ) ) );
			rough.assign( clamp( rough.add( mm.mul( 0.05 ) ).add( gpNoise( lp.mul( 150 ) ).sub( 0.5 ).mul( 0.06 ) ), 0.12, 0.9 ) );

		} ).ElseIf( pat.lessThan( 13.5 ), () => {

			const u = ang.mul( 24 );
			const w = lp.y.mul( 900 );
			const aa = float( 1 ).sub( smoothstep( 0.3, 1.2, fwidth( w ) ) );
			const k = abs( sin( u.add( w ) ) ).mul( abs( sin( u.sub( w ) ) ) );
			col.assign( base.mul( k.mul( 0.25 ).mul( aa ).add( 0.85 ) ) );
			height.assign( k.mul( 0.00012 ).mul( aa ) );

		} ).Else( () => {

			const sc = gpFbm( lp.mul( 250 ) );
			col.assign( base.mul( mix( 0.9, 1.15, sc ) ) );
			rough.assign( clamp( rough.add( sc.sub( 0.5 ).mul( 0.2 ) ), 0.6, 1 ) );

		} );

	} );

	return { color: col, roughness: rough, metalness: aux.y, height, pat };

}

// extra: { uniforms, positionNode, clearcoat }. positionNode is a callback receiving the
// compatibility uniform map and returning a TSL position node; it may assign normalLocal too.
export function createPropMaterial( name = 'gameProp', extra = {} ) {

	const m = extra.clearcoat
		? physical( { vertexColors: true, clearcoat: 1, clearcoatRoughness: 0.05 } )
		: standard( { vertexColors: true } );
	m.name = name;
	m.uniforms = makeUniforms( name, extra.uniforms );

	const s = propSurface();
	m.colorNode = s.color;
	m.roughnessNode = s.roughness;
	m.metalnessNode = s.metalness;
	m.normalNode = gpBump( s.height );

	if ( extra.clearcoat ) {

		const carbon = s.pat.greaterThan( 7.5 ).and( s.pat.lessThan( 8.5 ) );
		const thread = s.pat.greaterThan( 8.5 ).and( s.pat.lessThan( 9.5 ) );
		m.clearcoatNode = carbon.or( thread ).select( 1, 0 );
		m.clearcoatRoughnessNode = carbon.select( 0.05, thread.select( 0.04, 0.1 ) );

	}

	if ( extra.positionNode ) m.positionNode = extra.positionNode( m.uniforms );
	return m;

}

// Fishing line: camera-facing ribbon along a quadratic Bezier between two world points.
// The line mesh itself lives at identity, so these world positions are also valid local positions.
export function createLineMaterial() {

	const m = standard( {
		color: 0xd8dde0,
		roughness: 0.35,
		metalness: 0,
		side: THREE.DoubleSide,
	} );
	m.name = 'fishingLine';
	m.receiveShadows = true;
	m.uniforms = {
		lineA: uniform( new THREE.Vector3() ).setName( 'lineA' ),
		lineB: uniform( new THREE.Vector3() ).setName( 'lineB' ),
		lineCtl: uniform( new THREE.Vector3() ).setName( 'lineCtl' ),
		lineShow: uniform( 0 ).setName( 'lineShow' ),
	};

	m.positionNode = Fn( () => {

		const aLine = attribute( 'aLine', 'vec2' );
		const t = aLine.x;
		const side = aLine.y;
		const a = m.uniforms.lineA;
		const b = m.uniforms.lineB;
		const c = m.uniforms.lineCtl;
		const omt = float( 1 ).sub( t );
		const P = a.mul( omt.mul( omt ) ).add( c.mul( omt.mul( t ).mul( 2 ) ) ).add( b.mul( t.mul( t ) ) );
		const T = normalize( c.sub( a ).mul( omt.mul( 2 ) ).add( b.sub( c ).mul( t.mul( 2 ) ) ).add( vec3( 1e-6, 0, 0 ) ) );
		const toCam = cameraPosition.sub( P );
		const dist = length( toCam );
		const W = normalize( cross( T, toCam ).add( vec3( 0, 1e-6, 0 ) ) );
		const w = max( 0.0006, dist.mul( 0.0006 ) ).mul( m.uniforms.lineShow );

		normalLocal.assign( normalize( toCam ) );
		return P.add( W.mul( side ).mul( w ) );

	} )();

	return m;

}
