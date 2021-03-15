class Scene {
	constructor(_domElement, _width, _height, _clearColor, _controls, _socket, _initPlayerPosition, _colorIndex, _colorChangedCallback) {
		// player control
		this.controls = _controls;

		// socket to communicate with the server
		this.socket = _socket;

		// utility
		this.width = _width;
		this.height = _height;

		// scene
		this.scene = new THREE.Scene();

		// camera
		this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
		this.scene.add(this.camera);

		// renderer
		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setClearColor(new THREE.Color(_clearColor));
		this.renderer.setSize(this.width, this.height);

		// push the canvas to the DOM
		_domElement.append(this.renderer.domElement);

		// add event listeners
		window.addEventListener("resize", () => {
			this.width = window.innerWidth;
			this.height = window.innerHeight;
			this.renderer.setSize(this.width, this.height);
			this.camera.aspect = this.width / this.height;
			this.camera.updateProjectionMatrix();
		});

		// define player colors
		this.colors = [
			new THREE.Color(0.9, 0.5, 0.5),
			new THREE.Color(0.5, 0.9, 0.5),
			new THREE.Color(0.25, 0.75, 1),
			new THREE.Color(0.75, 0.75, 0.75)
		];

		// initial color index
		this.colorIndex = _colorIndex;

		// playerColorChanged function callback
		this.colorChangedCallback = _colorChangedCallback;

		// add lights
		const light = new THREE.HemisphereLight(new THREE.Color(1, 1, 1), new THREE.Color(0.75, 0.75, 0.75), 1);
		light.position.set(5, 5, 5);
		this.scene.add(light);

		// add ground
		this.scene.add(new THREE.GridHelper(50, 50));
		const groundGeometry = new THREE.PlaneGeometry(50, 50, 1, 1);
		const groundMaterial = new THREE.MeshBasicMaterial({ color: this.colors[3] }); // ground color
		this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
		this.groundMesh.rotation.x = THREE.Math.degToRad(-90);
		this.scene.add(this.groundMesh);

		// set init player position
		this.initPlayerPosition = new THREE.Vector3().fromArray(_initPlayerPosition);

		// add player
		this.addSelf();

		// Start the loop
		this.frameCount = 0;
		this.update(0);
	}

	getPlayer(playerColor, videoMaterial) {
		// bodySize
		const bodyRadius = 0.09;
		const bodyHeight = 0.5;
		const bodyHeightHalf = bodyHeight / 2;

		// headSize
		const headRadius = 0.25;

		// color
		const playerMaterial = new THREE.MeshLambertMaterial({ color: playerColor.getHex() });

		// body
		const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, 8), playerMaterial);

		// head
		const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 8, 8), videoMaterial);
		head.rotation.y = THREE.Math.degToRad(60); // note: why should this be 60 degrees?
		head.position.y = bodyHeightHalf + headRadius - 0.05;
		body.add(head);

		// add player to scene
		this.scene.add(body);
		return body;
	}

	addSelf() {
		this.player = this.getPlayer(this.colors[this.colorIndex], makeVideoMaterial("local"));
		this.player.visible = false; // make myself invisible
		this.listener = new THREE.AudioListener();
		this.player.add(this.listener);
		this.player.position.set(this.initPlayerPosition.x, this.initPlayerPosition.y, this.initPlayerPosition.z);
		this.controls.shouldJump = true; // this is just to send "move" once in the beginning
	}

	addClient(_clientProp, _id) {
		clients[_id].player = this.getPlayer(this.colors[_clientProp.colorIndex], makeVideoMaterial(_id));
		clients[_id].desiredPosition = new THREE.Vector3().fromArray(_clientProp.position);
		clients[_id].desiredQuaternion = new THREE.Quaternion().fromArray(_clientProp.quaternion);
		clients[_id].player.position.set(clients[_id].desiredPosition.x, clients[_id].desiredPosition.y, clients[_id].desiredPosition.z);
		clients[_id].player.quaternion.set(clients[_id].desiredQuaternion.x, clients[_id].desiredQuaternion.y, clients[_id].desiredQuaternion.z, clients[_id].desiredQuaternion.w);
	}

	removeClient(_id) {
		// remove player from scene
		if (clients[_id]) {
			this.scene.remove(clients[_id].player);
		}
	}

	restartRound(_clientProps) {
		this.controls.shouldJump = true; // this is just to send "move" once in the beginning
		for (const _id in _clientProps) {
			if (_id === id) { // player myself
				this.colorIndex = _clientProps[_id].colorIndex;
				this.player.material.color.setHex(this.colors[this.colorIndex].getHex());
				const desiredPosition = new THREE.Vector3().fromArray(_clientProps[_id].position);
				const desiredQuaternion = new THREE.Quaternion().fromArray(_clientProps[_id].quaternion);
				this.player.position.set(desiredPosition.x, desiredPosition.y, desiredPosition.z);
				this.player.quaternion.set(desiredQuaternion.x, desiredQuaternion.y, desiredQuaternion.z, desiredQuaternion.w);
			}
			else if (clients[_id]) { // other clients
				clients[_id].player.material.color.setHex(this.colors[_clientProps[_id].colorIndex].getHex());
				clients[_id].desiredPosition = new THREE.Vector3().fromArray(_clientProps[_id].position);
				clients[_id].desiredQuaternion = new THREE.Quaternion().fromArray(_clientProps[_id].quaternion);
				clients[_id].player.position.set(clients[_id].desiredPosition.x, clients[_id].desiredPosition.y, clients[_id].desiredPosition.z);
				clients[_id].player.quaternion.set(clients[_id].desiredQuaternion.x, clients[_id].desiredQuaternion.y, clients[_id].desiredQuaternion.z, clients[_id].desiredQuaternion.w);
			}
		}
		this.updateGroundColor(3); // set to default grey color whenever game restarts
	}

	updateGroundColor(_colorIndex) {
		this.groundMesh.material.color.setHex(this.colors[_colorIndex].getHex());
	}

	updateClientProps(_clientProps) {
		for (const _id in _clientProps) {
			// we'll update ourselves separately to avoid lag...
			if (_id != id && clients[_id]) {
				clients[_id].player.material.color.setHex(this.colors[_clientProps[_id].colorIndex].getHex());
				clients[_id].desiredPosition = new THREE.Vector3().fromArray(_clientProps[_id].position);
				clients[_id].desiredQuaternion = new THREE.Quaternion().fromArray(_clientProps[_id].quaternion);
			}
		}
	}

	interpolatePositions() {
		for (const _id in clients) {
			clients[_id].player.position.lerp(clients[_id].desiredPosition, 0.2);
			clients[_id].player.quaternion.slerp(clients[_id].desiredQuaternion, 0.2);
		}
	}

	updateClientVolumes() {
		for (const _id in clients) {
			const audioEl = document.getElementById(_id + "_audio");
			if (audioEl) {
				const distSquared = this.player.position.distanceToSquared(clients[_id].player.position);
				if (distSquared > 500) {
					audioEl.volume = 0;
				} else {
					const volume = Math.min(1, 10 / distSquared);
					audioEl.volume = volume;
				}
			}
		}
	}

	//////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////
	// Rendering

	updatePlayer(time) {
		const jumpSpeed = 0.25, jumpHeight = 1;
		if (this.controls.position.x || this.controls.position.z) {
			this.player.translateX(this.controls.position.x);
			this.player.translateZ(this.controls.position.z);
		}
		if (this.controls.rotation.y) {
			this.player.rotateY(this.controls.rotation.y);
		}
		if (this.controls.shouldJump) {
			if (this.controls.jumpStartTime == 0) {
				this.controls.jumpStartTime = time;
			}
			const elapsedTime = time - this.controls.jumpStartTime;
			const deg = elapsedTime * jumpSpeed;
			this.player.position.y = this.initPlayerPosition.y + Math.sin(THREE.Math.degToRad(deg)) * jumpHeight;
			if (deg >= 180) {
				this.player.position.y = this.initPlayerPosition.y;
				this.controls.shouldJump = false;
			}
		}
		if (this.controls.shouldChangeColor) {
			this.colorIndex = (this.colorIndex + 1) % 3;
			this.player.material.color.setHex(this.colors[this.colorIndex].getHex());
			this.socket.emit("colorIndex", this.colorIndex);
			this.colorChangedCallback();
			this.controls.shouldChangeColor = false;
		}
	}

	updateCamera() {
		// offset from camera to player
		const mousePositionY = this.controls.rotation.x;
		const relativeCameraOffset = new THREE.Vector3(0, mousePositionY * 0.25 + 0.5, 0.2);

		// update player world matrix for perfect camera follow
		this.player.updateMatrixWorld();

		// apply offset to player matrix
		const cameraOffset = relativeCameraOffset.applyMatrix4(this.player.matrixWorld);

		// set camera position to target position
		this.camera.position.set(cameraOffset.x, cameraOffset.y, cameraOffset.z);

		// make camera look at player
		this.camera.lookAt(this.player.position.x, this.player.position.y + 0.5, this.player.position.z);
	}

	update(time) {
		this.frameCount++;

		// update player
		this.updatePlayer(time);

		// update camera
		this.updateCamera();

		// adjust volumes by distance
		if (this.frameCount % 25 === 0) {
			this.updateClientVolumes();
		}

		// only send data to server when player moves
		if (this.controls.rotation.y || this.controls.position.x || this.controls.position.z || this.controls.shouldJump) {
			this.socket.emit("move", [
				[this.player.position.x, this.player.position.y, this.player.position.z],
				[this.player.quaternion.x, this.player.quaternion.y, this.player.quaternion.z, this.player.quaternion.w]
			]);
		}
		// interpolate client positions
		this.interpolatePositions();

		// render
		this.renderer.render(this.scene, this.camera);

		// call update again
		requestAnimationFrame((time) => this.update(time));
	}
}


//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
// Utilities

function makeVideoMaterial(_id) {
	const videoElement = document.getElementById(_id + "_video");
	const videoTexture = new THREE.VideoTexture(videoElement);
	const videoMaterial = new THREE.MeshBasicMaterial({
		map: videoTexture,
		overdraw: true,
		side: THREE.DoubleSide
	});
	return videoMaterial;
}