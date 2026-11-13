import { Group, Mesh, Vector3, BoxGeometry, Matrix4, Quaternion } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prepare, mergePrepared, box, cylinder, sphere, rod, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from './GameMaterials.js';
import { Vendor } from './Vendor.js';
import { FishProps } from '../world/fish/FishProps.js';
import { FISH } from './FishTable.js';

// The fish buyer's stall on the beach by the pier: a weathered plank shack with a rusty tin roof,
// a wooden fish box of crushed ice on the counter, a hanging spring scale, floats, crates, a
// chalkboard of prices and a hand-painted sign, and the buyer behind it. Built from photoscanned
// surfaces and props (StallKit, Poly Haven CC0); the old procedural stall is the fallback if they
// fail to load.
export const STAND = { x: 49.9, z: - 74.6, yaw: 1.45 }; // beside the boardwalk up from the pier foot, facing it

const STALL_FLOOR = 0.06; // top of the stall's plank floor (local y)
const ICE_TOP = 1.27; // top of the ice in the chest on the counter (local y)

export class FishStand {

	constructor( { scene, terrain, colliders } ) {

		const y = terrain.heightAt( STAND.x, STAND.z );
		this.material = createPropMaterial( 'fishStand' );
		this.group = new Group();
		this.group.name = 'FishStand';
		this.group.position.set( STAND.x, y, STAND.z );
		this.group.rotation.y = STAND.yaw;
		scene.add( this.group );
		// First migration pass: use the procedural stall. The scanned Poly Haven kit is ported
		// separately so gameplay does not wait on the texture-array material conversion.
		const stallMesh = new Mesh( buildStall(), this.material );
		stallMesh.name = 'FishStandStall';
		stallMesh.castShadow = true;
		this.group.add( stallMesh );
		this.ready = Promise.resolve();

		// the buyer stands behind the counter (local -Z), facing out (+Z)
		// (local z 0.12: clear of the shelf at -0.78..-0.48 and the counter top from 0.58)
		const local = new Vector3( 0.2, 0, 0.12 ).applyAxisAngle( new Vector3( 0, 1, 0 ), STAND.yaw );
		this.vendor = new Vendor( {
			name: 'Joe · Fish buyer',
			kind: 'buyer',
			position: new Vector3( STAND.x + local.x, y + STALL_FLOOR, STAND.z + local.z ),
			yaw: STAND.yaw,
			radius: 3.2,
			greeting: 'Let\'s see what you caught. Fair prices, cash.',
			idle: 'Nothing to sell? The grunts are biting off the pier.',
			material: this.material,
			// realistic character (Rocketbox, MIT): the stand-in shows until it has loaded
			character: { url: ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/characters/joe.glb', idle: 'idle_neutral_01', talk: 'gestic_talk_relaxed_01', greet: 'wave_01' },
		} );
		scene.add( this.vendor.group );

		// the stall is solid (counter front and the side walls)
		if ( colliders ) {

			colliders.addBox( new Vector3( STAND.x, y + 1.2, STAND.z ), new Vector3( 1.45, 1.2, 0.95 ), STAND.yaw, { tag: 'fishStand' } );
			// the crates, the bucket and the chalkboard around it
			for ( const [ lx, lz, hx, hz, hy ] of [ [ - 1.85, 0.25, 0.45, 0.25, 0.35 ], [ 1.8, - 0.2, 0.3, 0.6, 0.23 ], [ 1.55, 1.05, 0.2, 0.2, 0.28 ], [ 1.95, 1.45, 0.35, 0.25, 0.42 ] ] ) {

				const w = new Vector3( lx, 0, lz ).applyAxisAngle( new Vector3( 0, 1, 0 ), STAND.yaw );
				colliders.addBox( new Vector3( STAND.x + w.x, y + hy, STAND.z + w.z ), new Vector3( hx, hy, hz ), STAND.yaw, { tag: 'fishStandProps' } );

			}

		}

	}

	// fish laid on the ice chest (world frames for CatchDisplay): { species, frame, L, pose }
	iceFish() {

		const out = [];
		const list = [ [ 'jack', 0.36 ], [ 'redSnapper', 0.34 ], [ 'yellowtail', 0.3 ], [ 'grunt', 0.26 ], [ 'mullet', 0.33 ] ];
		const base = new Matrix4().makeRotationY( STAND.yaw ).setPosition( STAND.x, this.group.position.y, STAND.z );
		list.forEach( ( [ species, L ], i ) => {

			// across the chest, nose toward the customer's right, alternating flanks, a little askew. The
			// frame origin is the fish's body axis: lift it by the half thickness of the fish lying on its
			// side so it rests on the ice instead of sinking into it; later fish lie a little higher,
			// overlapping the one before like a real display.
			const rest = FishProps.restHeight( FISH[ species ].model, L );
			const local = new Matrix4().makeRotationY( ( i % 2 ? 0.12 : - 0.1 ) ).setPosition( - 0.55 + ( i % 2 ? 0.04 : - 0.04 ), ICE_TOP + rest + 0.006 * i, 0.7 + i * 0.085 );
			out.push( { species, frame: new Matrix4().multiplyMatrices( base, local ), L, pose: i % 2 ? 'sideFlip' : 'side' } );

		} );
		return out;

	}

	update( dt, player ) {

		this.vendor.update( dt, player );

	}

}

// Stall in local space: 2.6 m wide (x), 1.6 m deep (z, counter at +z), roof sloping back.
function buildStall() {

	const P = [];
	const add = ( g, o ) => P.push( prepare( g, o ) );
	const WOOD = ( c = 0x8a7a66 ) => ( { color: c, rough: 0.9, pattern: PAT.wood } );
	const WOODX = ( c = 0x8a7a66 ) => ( { color: c, rough: 0.9, pattern: PAT.woodX } );
	const TIN = { color: 0x8c9296, rough: 0.55, metal: 0.7, pattern: PAT.rusty };
	const V = ( x, y, z ) => new Vector3( x, y, z );
	let seed = 7;
	const rnd = () => ( ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647 );
	const jit = ( a ) => ( rnd() - 0.5 ) * a;

	// four posts, slightly out of true; front ones taller for the roof slope
	for ( const [ x, z, hgt ] of [ [ - 1.25, 0.75, 2.45 ], [ 1.25, 0.75, 2.42 ], [ - 1.25, - 0.75, 2.12 ], [ 1.25, - 0.75, 2.15 ] ] ) {

		add( box( 0.1, hgt, 0.1 ), { ...WOOD( 0x7d6c58 ), matrix: mat4( x, hgt / 2, z, jit( 0.03 ), 0, jit( 0.03 ) ) } );

	}

	// counter front: horizontal planks of uneven width and tone, one missing near the bottom
	let yy = 0.12;
	for ( let i = 0; i < 7; i ++ ) {

		const w = 0.12 + rnd() * 0.04;
		if ( i !== 1 ) add( box( 2.56 + jit( 0.05 ), w - 0.012, 0.025 ), { ...WOODX( [ 0x8e7e68, 0x7a6b58, 0x9a8c78, 0x6f624f ][ i % 4 ] ), matrix: mat4( jit( 0.03 ), yy + w / 2, 0.8, 0, jit( 0.02 ), jit( 0.015 ) ) } );
		yy += w;

	}

	// counter top (thick, scrubbed boards) and a shelf behind it
	for ( let i = 0; i < 4; i ++ ) add( box( 2.7, 0.045, 0.15 ), { ...WOODX( i % 2 ? 0x9b8b74 : 0x8d7d68 ), matrix: mat4( jit( 0.02 ), 1.02, 0.66 + i * 0.155, 0, jit( 0.015 ), 0 ) } );
	add( box( 2.5, 0.035, 0.3 ), { ...WOODX( 0x7a6b58 ), matrix: mat4( 0, 0.7, - 0.63 ) } );
	// plank floor inside the stall (the buyer stands on it, between the shelf and the counter)
	for ( let i = 0; i < 9; i ++ ) add( box( 2.52, 0.04, 0.165 + jit( 0.01 ) ), { ...WOODX( [ 0x7a6b58, 0x6f624f, 0x857562 ][ i % 3 ] ), matrix: mat4( jit( 0.02 ), STALL_FLOOR - 0.02, - 0.7 + i * 0.172, 0, jit( 0.02 ), 0 ) } );
	// side walls: vertical planks, half height
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 11; i ++ ) {

		const z = - 0.72 + i * 0.145;
		add( box( 0.022, 1.0 + jit( 0.06 ), 0.13 ), { ...WOOD( [ 0x857562, 0x77684f, 0x928470 ][ i % 3 ] ), matrix: mat4( s * 1.3, 0.52, z, 0, 0, jit( 0.02 ) ) } );

	}

	// back wall planks up to the roof
	for ( let i = 0; i < 18; i ++ ) {

		const x = - 1.25 + i * 0.147;
		add( box( 0.135, 2.05 + jit( 0.05 ), 0.022 ), { ...WOOD( [ 0x7f6f5b, 0x8a7a64, 0x6d604e ][ i % 3 ] ), matrix: mat4( x, 1.03, - 0.8, jit( 0.01 ), 0, 0 ) } );

	}

	// roof: rafters and corrugated tin sheets, one lifted and rusted through at the edge
	for ( const x of [ - 1.25, 0, 1.25 ] ) add( box( 0.07, 0.09, 2.0 ), { ...WOOD( 0x6d604e ), matrix: mat4( x, 2.33, 0, - 0.16 ) } );
	for ( let i = 0; i < 4; i ++ ) {

		const x = - 1.14 + i * 0.76;
		const g = corrugated( 0.8, 2.1, 9 );
		add( g, { ...TIN, matrix: mat4( x, 2.4 + ( i === 3 ? 0.03 : 0 ), 0.04, - 0.16 + ( i === 3 ? 0.03 : 0 ), jit( 0.02 ), jit( 0.02 ) ) } );

	}

	// ice chest on the counter with fish on ice
	add( box( 0.9, 0.22, 0.5 ), { color: 0x2f6f8f, rough: 0.5, matrix: mat4( - 0.55, 1.15, 0.85 ) } );
	add( box( 0.84, 0.03, 0.44 ), { color: 0xe7eef0, rough: 0.15, matrix: mat4( - 0.55, 1.255, 0.85 ) } );
	// (the fish on the ice are real fish models: FishStand.iceFish / CatchDisplay)

	// hanging scale
	add( rod( V( 0.6, 2.25, 0.62 ), V( 0.6, 1.75, 0.62 ), 0.006, 4 ), { color: 0x555a5c, rough: 0.4, metal: 1 } );
	add( cylinder( 0.1, 0.1, 0.05, 18 ), { color: 0xc9c2b0, rough: 0.5, metal: 0.4, pattern: PAT.rusty, matrix: mat4( 0.6, 1.66, 0.62, Math.PI / 2, 0, 0 ) } );
	add( cylinder( 0.14, 0.11, 0.05, 16 ), { color: 0xa9b0b3, rough: 0.35, metal: 1, matrix: mat4( 0.6, 1.45, 0.62 ) } );
	// floats hanging from the eave, a coiled line and a bucket
	for ( let i = 0; i < 5; i ++ ) add( sphere( 0.06, 10, 8 ), { color: [ 0xe2552a, 0xf2c230, 0xe8e2d0, 0x2f8f6f, 0xe2552a ][ i ], rough: 0.5, matrix: mat4( - 1.1 + i * 0.5, 2.05 + jit( 0.1 ), 0.95 ) } );
	for ( let i = 0; i < 5; i ++ ) add( rod( V( - 1.1 + i * 0.5, 2.4, 0.95 ), V( - 1.1 + i * 0.5, 2.1, 0.95 ), 0.004, 3 ), { color: 0xcbb999, rough: 0.9 } );
	add( cylinder( 0.16, 0.13, 0.3, 14, 1, true ), { color: 0x3d6d8a, rough: 0.6, pattern: PAT.rusty, matrix: mat4( 1.6, 0.15, 0.9 ) } );
	add( cylinder( 0.15, 0.15, 0.02, 14 ), { color: 0x2a2a2a, rough: 0.9, matrix: mat4( 1.6, 0.02, 0.9 ) } );
	// a board propped against the front: the price chalkboard
	add( box( 0.55, 0.75, 0.03 ), { color: 0x2a302c, rough: 0.9, matrix: mat4( 1.75, 0.4, 1.0, - 0.28, 0.3, 0 ) } );
	add( box( 0.6, 0.8, 0.02 ), { ...WOOD( 0x7a6b58 ), matrix: mat4( 1.75, 0.4, 0.985, - 0.28, 0.3, 0 ) } );
	return mergePrepared( P );

}

// Corrugated sheet in the xz plane (ribs along z), width w, length l.
function corrugated( w, l, ribs ) {

	const g = new BoxGeometry( w, 0.012, l, Math.max( 2, ribs * 4 ), 1, 1 );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i );
		p.setY( i, p.getY( i ) + Math.sin( ( x / w + 0.5 ) * ribs * Math.PI * 2 ) * 0.012 );

	}

	g.computeVertexNormals();
	return g;

}
