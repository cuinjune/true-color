THREE.PlayerControls = function () {
    this.enabled = false;
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.shouldJump = false;
    this.jumpStartTime = 0;
    const PI_2 = Math.PI * 0.5;
    const stepAmount = 0.05;
    const rotationAmountX = 0.002;
    const rotationAmountY = 0.005;
    this.shouldChangeColor = false;

    document.onkeydown = function myFunction() {
        if (this.enabled === false) return;
        const e = event || window.event; // window.event for IE
        switch (e.keyCode) {
            case 38: // up
            case 87: // w
                this.position.z = -stepAmount;
                break;
            case 40: // down
            case 83: // s
                this.position.z = stepAmount;
                break;
            case 37: // left
            case 65: // a
                this.position.x = -stepAmount;
                break;
            case 39: // right
            case 68: // d
                this.position.x = stepAmount;
                break;
            case 32: // space
                if (!this.shouldJump) {
                    this.jumpStartTime = 0;
                    this.shouldJump = true;
                }
                break;
            case 16: // shift
                break;
        }
    }.bind(this)

    document.onkeyup = function myFunction() {
        if (this.enabled === false) return;
        const e = event || window.event; // window.event for IE
        switch (e.keyCode) {
            case 38: // up
            case 87: // w
                this.position.z = 0;
                break;
            case 40: // down
            case 83: // s
                this.position.z = 0;
                break;
            case 37: // left
            case 65: // a
                this.position.x = 0;
                break;
            case 39: // right
            case 68: // d
                this.position.x = 0;
                break;
            case 32: // space
                break;
            case 16: // shift
                break;
        }
    }.bind(this)

    document.onmousedown = function myFunction() {
        if (this.enabled === false) return;
        const e = event || window.event; // window.event for IE
        const buttonKind = e.keyCode || e.which;
        if (buttonKind == 1 && !this.shouldChangeColor) { // left click
            this.shouldChangeColor = true;
        }
    }.bind(this)

    document.onmousemove = function myFunction() {
        if (this.enabled === false) return;
        var movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        var movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
        this.rotation.y = -movementX * rotationAmountY;
        if (this.rotation.y > -0.02 && this.rotation.y < 0.02) this.rotation.y = 0;
        if (this.rotation.y < -0.2) this.rotation.y = -0.2;
        if (this.rotation.y > 0.2) this.rotation.y = 0.2;
        this.rotation.x += movementY * rotationAmountX;
        this.rotation.x = Math.max(-PI_2, Math.min(PI_2, this.rotation.x));
        if (this.rotation.x < -0.5) this.rotation.x = -0.5;
        if (this.rotation.x > 0.5) this.rotation.x = 0.5;
    }.bind(this)
};